import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import { cors } from 'hono/cors'
import { streamSSE } from 'hono/streaming'
import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'

import { TransactionBuilder, Networks, type Transaction } from '@stellar/stellar-sdk'

import { requireEnv } from './env'
import { DfnsWebhookEventSchema, type DfnsWebhookEvent } from './dfns/types'
import { listPolicies } from './dfns/policies'
import { listWallets, createStellarWallet } from './dfns/wallets'
import { DfnsStellarNetworkSchema } from './dfns/types'
import { broadcastStellarTx, waitForSignatureTerminal, envelopeFromSignedData } from './dfns/sign'
import { inspectSignXdr, readSignGuardConfig, SignGuardRejected } from './dfns/sign-guard'
import { listPendingApprovals, decideApproval, type ApprovalDecision } from './dfns/approvals'
import { buildMcaRecords, toEsmaJson, type StellarTxSnapshot, type ExportContext } from './mica-export'
import { lookupDti } from './dfns/dti-codes'

const REPLAY_WINDOW_SEC = 300
const HEARTBEAT_MS = 20_000
const RING_SIZE = 200

const bus = new EventEmitter()
bus.setMaxListeners(0)

// dedup ring buffer. dfns retries up to 5 times over 24h on non-2xx, so
// keeping the last 200 event ids lets us absorb the duplicates cleanly.
const seen = new Set<string>()
const order: string[] = []
const eventHistory: DfnsWebhookEvent[] = []
const HISTORY_CAP = 5000

function dedupe(id: string): boolean {
  if (seen.has(id)) return true
  seen.add(id)
  order.push(id)
  if (order.length > RING_SIZE) {
    const dropped = order.shift()
    if (dropped) seen.delete(dropped)
  }
  return false
}

// token gate for the custody read endpoints. off when LOBSTER_API_TOKEN is
// unset so local dev is unaffected. cors only blocks browsers, not curl, so
// these need a server-side check. takes a bearer header, x-lobster-token, or
// a ?token= query, the last one being how EventSource (no headers) sends it.
const tokenGuard = async (c: Context, next: Next) => {
  const required = process.env.LOBSTER_API_TOKEN
  if (!required) return next()
  const auth = c.req.header('authorization') ?? ''
  const presented =
    (auth.toLowerCase().startsWith('bearer ') ? auth.slice(7) : '') ||
    c.req.header('x-lobster-token') ||
    c.req.query('token') ||
    ''
  const a = Buffer.from(presented)
  const b = Buffer.from(required)
  if (a.length === 0 || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return c.text('unauthorized', 401)
  }
  return next()
}

// fixed-window per-ip limiter for the write/custody routes. a dfns sign or a
// wallet create each cost a real upstream call, so a caller past the token (or
// hitting the open dev path) could amplify load or burn dfns quota. generous by
// default; a prod deploy tightens it with RATE_LIMIT_PER_MIN.
const rlWindows = new Map<string, { count: number; resetAt: number }>()
const rateLimit = async (c: Context, next: Next) => {
  const perMin = Number(process.env.RATE_LIMIT_PER_MIN ?? '120')
  const key = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
  const now = Date.now()
  const w = rlWindows.get(key)
  if (!w || now >= w.resetAt) {
    rlWindows.set(key, { count: 1, resetAt: now + 60_000 })
    return next()
  }
  if (w.count >= perMin) return c.json({ error: 'rate limit exceeded' }, 429)
  w.count++
  return next()
}

export const app = new Hono()

app.get('/health', (c) => c.json({ status: 'ok', service: 'lobster-dfns-webhook' }))

app.use('*', cors({
  origin: process.env.DASHBOARD_ORIGIN ?? 'http://localhost:5173',
  credentials: true,
}))

app.get('/dfns/policies', tokenGuard, async (c) => {
  try {
    const res = await listPolicies()
    return c.json({ items: res.items ?? [] })
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502)
  }
})

app.get('/dfns/wallets', tokenGuard, async (c) => {
  try {
    const wallets = await listWallets()
    return c.json({ items: wallets })
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502)
  }
})

app.post('/dfns/wallets', rateLimit, tokenGuard, async (c) => {
  let body: { name?: string; network?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'bad json' }, 400)
  }
  const parsed = DfnsStellarNetworkSchema.safeParse(body.network)
  if (!body.name || !parsed.success) {
    return c.json({ error: 'name and network (Stellar | StellarTestnet) required' }, 400)
  }
  try {
    const w = await createStellarWallet(body.name, parsed.data)
    return c.json(w)
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502)
  }
})

app.get('/dfns/approvals', tokenGuard, async (c) => {
  try {
    const res = await listPendingApprovals()
    return c.json({ items: res.items ?? [] })
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502)
  }
})

app.post('/dfns/approvals/:id/decision', rateLimit, tokenGuard, async (c) => {
  // fail-closed like /dfns/sign: deciding an approval authorizes a pending
  // signature, so it carries the same risk as signing. the token guard is a
  // no-op without the env, and we will not let a misconfigured deploy approve
  // a treasury tx with no auth.
  if (!process.env.LOBSTER_API_TOKEN) {
    return c.json({ error: 'LOBSTER_API_TOKEN must be set before approvals can be decided' }, 503)
  }
  const id = c.req.param('id')
  if (!id) return c.json({ error: 'missing approval id' }, 400)
  let body: { value?: ApprovalDecision; reason?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'bad json' }, 400)
  }
  if (body.value !== 'Approved' && body.value !== 'Denied') {
    return c.json({ error: 'value must be Approved or Denied' }, 400)
  }
  try {
    const res = await decideApproval(id, body.value, body.reason)
    return c.json(res)
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502)
  }
})

// passphrase is derived from server env so a caller cannot trick dfns into
// signing the wrong network. body.networkPassphrase is only accepted when it
// matches what the env says; mismatched values get a 400 back.
function serverPassphrase(): string {
  const net = process.env.DFNS_STELLAR_NETWORK
  if (net === 'Stellar') return Networks.PUBLIC
  return Networks.TESTNET
}

app.post('/dfns/sign', rateLimit, tokenGuard, async (c) => {
  // fail-closed: refuse to sign anything when the shared token is unset.
  // the token guard alone is a no-op without the env, and the dfns wallet
  // holds the treasury key so a misconfigured deploy would otherwise sign
  // arbitrary xdr.
  if (!process.env.LOBSTER_API_TOKEN) {
    return c.json({ error: 'LOBSTER_API_TOKEN must be set before /dfns/sign is enabled' }, 503)
  }
  const walletId = process.env.DFNS_STELLAR_WALLET_ID
  if (!walletId) return c.json({ error: 'DFNS_STELLAR_WALLET_ID not set' }, 503)
  const guard = readSignGuardConfig()
  if (!guard) {
    return c.json(
      { error: 'sign guard not configured: set DFNS_TREASURY_ADDRESS, DFNS_DESTINATION_WHITELIST and DFNS_MAX_AMOUNT_STROOPS, or DFNS_GUARD_PERMISSIVE=1 for tests' },
      503,
    )
  }
  let body: { xdr?: string; networkPassphrase?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'bad json' }, 400)
  }
  if (!body.xdr) {
    return c.json({ error: 'xdr required' }, 400)
  }
  const passphrase = serverPassphrase()
  if (body.networkPassphrase && body.networkPassphrase !== passphrase) {
    return c.json({ error: 'networkPassphrase mismatch with DFNS_STELLAR_NETWORK' }, 400)
  }
  try {
    const tx = TransactionBuilder.fromXDR(body.xdr, passphrase) as Transaction
    // dfns kind:Transaction does not handle RestoreFootprint envelopes; the
    // caller must run the restore through wallet kit first then resubmit.
    if (tx.operations.some((op) => op.type === 'restoreFootprint')) {
      return c.json(
        { error: 'restoreFootprint must be signed by the wallet kit, not dfns' },
        400,
      )
    }
    try {
      inspectSignXdr(tx, guard)
    } catch (err) {
      if (err instanceof SignGuardRejected) {
        return c.json({ error: err.message }, 400)
      }
      throw err
    }
    const initial = await broadcastStellarTx(walletId, tx)
    const final = await waitForSignatureTerminal(walletId, initial.id)
    if (!final.signedData) return c.json({ error: `no signed envelope (status ${final.status})` }, 502)
    const back = envelopeFromSignedData(final.signedData, passphrase)
    return c.json({ signedTxXdr: back.toXDR() })
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502)
  }
})

app.post('/webhooks/dfns', async (c) => {
  const raw = await c.req.text()
  const sigHeader = c.req.header('x-dfns-webhook-signature') ?? ''
  // header value is `sha256=<hex>` per dfns docs; strip the prefix when present
  const sig = sigHeader.startsWith('sha256=') ? sigHeader.slice(7) : sigHeader
  const expected = crypto
    .createHmac('sha256', requireEnv('DFNS_WEBHOOK_SECRET'))
    .update(raw)
    .digest('hex')

  const a = Buffer.from(sig, 'hex')
  const b = Buffer.from(expected, 'hex')
  if (a.length === 0 || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return c.text('bad signature', 401)
  }

  let evt: DfnsWebhookEvent
  try {
    evt = DfnsWebhookEventSchema.parse(JSON.parse(raw))
  } catch {
    return c.text('bad payload', 400)
  }

  if (Math.abs(Date.now() / 1000 - evt.timestampSent) > REPLAY_WINDOW_SEC) {
    return c.text('stale event', 401)
  }

  if (dedupe(evt.id)) return c.text('ok', 200)

  eventHistory.push(evt)
  if (eventHistory.length > HISTORY_CAP) eventHistory.shift()

  bus.emit('event', evt)
  return c.text('ok', 200)
})

// in-memory event ring buffer mapped to mica records. legal review supplies
// the dti + venue resolvers later; the skeleton fills 'UNKNOWN' so the
// export is valid json an auditor can inspect today.
function eventToSnapshot(evt: DfnsWebhookEvent): StellarTxSnapshot | null {
  const data = (evt.data ?? {}) as Record<string, unknown>
  const hash = typeof data['txHash'] === 'string' ? (data['txHash'] as string) : evt.id
  const closeTime = evt.date ?? new Date(evt.timestampSent * 1000).toISOString()
  const sourceAccount = typeof data['walletAddress'] === 'string' ? (data['walletAddress'] as string) : 'UNKNOWN'
  return {
    hash,
    ledgerCloseTime: closeTime,
    sourceAccount,
    operations: [
      {
        type: 'invoke_host_function',
        sourceAccount,
        destination: typeof data['destination'] === 'string' ? (data['destination'] as string) : undefined,
        amount: typeof data['amount'] === 'string' ? (data['amount'] as string) : undefined,
      },
    ],
  }
}

function defaultExportContext(): ExportContext {
  return {
    caspLei: process.env.LOBSTER_CASP_LEI ?? 'TBD-LEI-LOBSTER',
    resolveDti: (asset) => lookupDti({
      asset: asset.code,
      issuer: asset.issuer,
      contractId: asset.contractId,
    }),
    resolveVenue: () => 'STELLAR',
  }
}

app.get('/dfns/audit/export', tokenGuard, (c) => {
  const ctx = defaultExportContext()
  const snapshots = eventHistory
    .filter((e) => e.kind.startsWith('wallet.transaction.') || e.kind.startsWith('wallet.transfer.'))
    .map((e) => eventToSnapshot(e))
    .filter((s): s is StellarTxSnapshot => !!s)
  // one continuous hash chain across every tx, so verifyChain validates the
  // whole export end to end instead of breaking at each tx boundary.
  const records: ReturnType<typeof buildMcaRecords> = []
  let prevHash: string | null = null
  for (const s of snapshots) {
    const recs = buildMcaRecords(s, ctx, prevHash)
    if (recs.length) prevHash = recs[recs.length - 1].recordHash
    records.push(...recs)
  }
  return c.body(toEsmaJson(records), 200, {
    'content-type': 'application/json',
    'content-disposition': `attachment; filename="mica-export-${Date.now()}.json"`,
  })
})

// forward metadata only. the raw dfns `data` field carries signed
// envelopes, wallet ids, amounts and approver identities; the feed ui
// only needs id/kind/time, so never ship `data` to connected clients.
export function buildSseFrame(e: DfnsWebhookEvent): { id: string; event: string; data: string } {
  return {
    id: e.id,
    event: e.kind,
    data: JSON.stringify({ id: e.id, kind: e.kind, timestampSent: e.timestampSent }),
  }
}

app.get('/sse', tokenGuard, (c) => streamSSE(c, async (stream) => {
  // emit the retry hint first so the browser uses it on reconnect
  await stream.write('retry: 10000\n\n')
  const onEvent = (e: DfnsWebhookEvent) => {
    stream.writeSSE(buildSseFrame(e))
  }
  bus.on('event', onEvent)
  stream.onAbort(() => { bus.off('event', onEvent) })
  while (!stream.aborted) {
    await stream.writeSSE({ event: 'ping', data: '' })
    await stream.sleep(HEARTBEAT_MS)
  }
}))

export { bus }
