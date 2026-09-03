import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import { cors } from 'hono/cors'
import { streamSSE } from 'hono/streaming'
import crypto from 'node:crypto'
import { EventEmitter } from 'node:events'

import { TransactionBuilder, Networks } from '@stellar/stellar-sdk'

import { requireEnv } from './env'
import { DfnsWebhookEventSchema, type DfnsWebhookEvent } from './dfns/types'
import { listPolicies } from './dfns/policies'
import { listWallets, createStellarWallet } from './dfns/wallets'
import { DfnsStellarNetworkSchema } from './dfns/types'
import { broadcastStellarTx, waitForSignatureTerminal, envelopeFromSignedData, isTerminal, getSignatureStatus } from './dfns/sign'
import { inspectSignXdr, readSignGuardConfig, SignGuardRejected } from './dfns/sign-guard'
import { transferNative } from './dfns/transfer'
import { reSequence } from './dfns/resequence'
import { unresolvedSignature, trackPending, clearPending } from './dfns/inflight'
import { registerAllbridgeRoutes } from './allbridge/routes'
import { listPendingApprovals, decideApproval, type ApprovalDecision } from './dfns/approvals'
import { buildMcaRecords, toEsmaJson, verifyChain, type StellarTxSnapshot, type ExportContext } from './mica-export'
import { lookupDti } from './dfns/dti-codes'
import { scanNetwork } from './ttl-monitor/index'
import type { ScanResult } from './ttl-monitor/monitor'
import type { Network } from '../src/config/contracts'

const REPLAY_WINDOW_SEC = 300
const HEARTBEAT_MS = 20_000
const RING_SIZE = 200
// how long /dfns/sign waits for an instant result before handing back a pending
// id. an op no policy holds (a trustline) confirms inside this window; a payment
// held for approval does not, so the client tracks it via /dfns/sign/:id/status.
const PENDING_POLL_MS = 10_000

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

// second gate, on top of tokenGuard, for the two routes that write to the
// custody org: creating a wallet and deciding an approval. LOBSTER_API_TOKEN is
// inlined into the browser bundle by vite, so every visitor of the dashboard
// holds it and it cannot stand alone in front of a write. this token never
// reaches the client. unset means the routes stay shut, like /dfns/sign does
// without LOBSTER_API_TOKEN.
const operatorGuard = async (c: Context, next: Next) => {
  const required = process.env.LOBSTER_OPERATOR_TOKEN
  if (!required) {
    return c.json(
      { error: 'LOBSTER_OPERATOR_TOKEN must be set before this route is enabled' },
      503,
    )
  }
  const presented = c.req.header('x-lobster-operator-token') ?? ''
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
  // drop expired windows once the map grows, so a churn of distinct ips can't
  // leak memory over the life of the process.
  if (rlWindows.size > 256) {
    for (const [k, v] of rlWindows) if (now >= v.resetAt) rlWindows.delete(k)
  }
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

// allbridge core bridge (mainnet-only): read/quote/status + unsigned tx build
registerAllbridgeRoutes(app)

// storage ttl read for the dashboard countdown. public, since it only reads
// public ledger state, and 503 when the factory isn't deployed on the asked
// network so the ui gates the card instead of showing a broken read. answers
// from a short cache: ttls move one ledger at a time, and an unauthenticated
// route must not fan out into an rpc call per request.
const TTL_CACHE_MS = 60_000
const ttlCache = new Map<Network, { at: number; scan: ScanResult }>()

app.get('/ttl', async (c) => {
  const network: Network = c.req.query('network') === 'mainnet' ? 'mainnet' : 'testnet'
  let entry = ttlCache.get(network)
  if (!entry || Date.now() - entry.at >= TTL_CACHE_MS) {
    try {
      entry = { at: Date.now(), scan: await scanNetwork(network) }
      ttlCache.set(network, entry)
    } catch (err) {
      // rpc down. serve the last good scan and hold off re-scanning for a window,
      // so this public route can't be turned into an rpc amplifier during an
      // outage. 503 only when we have never scanned this network.
      if (!entry) return c.json({ error: (err as Error).message }, 503)
      entry.at = Date.now()
    }
  }
  const scan = entry.scan
  return c.json({
    network,
    latestLedger: scan.latestLedger,
    statuses: scan.statuses.map((s) => ({
      key: s.keyXdr,
      remainingLedgers: s.reading.remainingLedgers,
      remainingSeconds: s.reading.remainingSeconds,
      level: s.reading.level,
    })),
  })
})

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

app.post('/dfns/wallets', rateLimit, tokenGuard, operatorGuard, async (c) => {
  // fail-closed like /dfns/sign: creating a wallet writes to the custody account,
  // and the token guard is a no-op when the env is unset.
  if (!process.env.LOBSTER_API_TOKEN) {
    return c.json({ error: 'LOBSTER_API_TOKEN must be set before wallets can be created' }, 503)
  }
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

app.post('/dfns/approvals/:id/decision', rateLimit, tokenGuard, operatorGuard, async (c) => {
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

// A payment DFNS builds itself, rather than an envelope we hand it. That is the
// only shape its approval rules can actually read, so it is the one request that
// a rule can wave through. Same bounds as /dfns/sign: the destination has to be
// on the whitelist and the amount under the cap.
app.post('/dfns/transfer', rateLimit, tokenGuard, async (c) => {
  if (!process.env.LOBSTER_API_TOKEN) {
    return c.json({ error: 'LOBSTER_API_TOKEN must be set before /dfns/transfer is enabled' }, 503)
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
  let body: { to?: string; stroops?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'bad json' }, 400)
  }
  if (!body.to || !body.stroops) return c.json({ error: 'to and stroops are required' }, 400)
  try {
    const out = await transferNative(walletId, { to: body.to, stroops: body.stroops }, guard)
    const held = Boolean((out as { approvalId?: string }).approvalId)
    return c.json({
      id: out.id,
      status: out.status,
      approvalId: (out as { approvalId?: string }).approvalId ?? null,
      txHash: (out as { txHash?: string }).txHash ?? null,
      held,
    })
  } catch (err) {
    if (err instanceof SignGuardRejected) return c.json({ error: err.message }, 400)
    const msg = err instanceof Error ? err.message : 'transfer failed'
    return c.json({ error: msg }, 502)
  }
})

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
    const tx = TransactionBuilder.fromXDR(body.xdr, passphrase)
    if ('innerTransaction' in tx) {
      return c.json({ error: 'fee-bump transactions are not accepted here' }, 400)
    }
    // dfns kind:Transaction does not handle RestoreFootprint envelopes; the
    // caller must run the restore through wallet kit first then resubmit.
    if (tx.operations.some((op) => op.type === 'restoreFootprint')) {
      return c.json(
        { error: 'restoreFootprint must be signed by the wallet kit, not dfns' },
        400,
      )
    }
    // rebind the sequence right before handing off, then guard the tx we broadcast
    const fresh = await reSequence(tx, passphrase)
    try {
      inspectSignXdr(fresh, guard)
    } catch (err) {
      if (err instanceof SignGuardRejected) {
        return c.json({ error: err.message }, 400)
      }
      throw err
    }
    // one treasury signature at a time: a second tx built while one is held for
    // approval reuses the same sequence and would tx_bad_seq on broadcast.
    const busy = await unresolvedSignature(walletId, getSignatureStatus, isTerminal)
    if (busy) {
      return c.json(
        { error: 'a treasury signature is already awaiting approval; approve or deny it in the dfns console first', pending: true, id: busy },
        409,
      )
    }
    const initial = await broadcastStellarTx(walletId, fresh)
    const final = await waitForSignatureTerminal(walletId, initial.id, PENDING_POLL_MS)
    if (final.status === 'Failed' || final.status === 'Rejected') {
      return c.json({ error: `dfns ${final.status}${final.reason ? `: ${final.reason}` : ''}` }, 502)
    }
    // a hash means dfns already broadcast it (a classic tx); return it whether or
    // not the ledger has closed, so a slow confirm is not read as an approval hold.
    if (final.txHash) {
      return c.json({ txHash: final.txHash })
    }
    // soroban tx: dfns only signs, so hand back the envelope for the caller to
    // submit through their own rpc.
    if (final.signedData) {
      const back = envelopeFromSignedData(final.signedData, passphrase)
      return c.json({ signedTxXdr: back.toXDR() })
    }
    // no hash and no envelope: an approval policy is holding it for a human. hand
    // the id back so the client can show pending and poll for the eventual hash.
    if (!isTerminal(final.status)) {
      trackPending(walletId, initial.id)
      return c.json({ pending: true, id: initial.id })
    }
    return c.json({ error: `no txHash or signed envelope (status ${final.status})` }, 502)
  } catch (err) {
    return c.json({ error: (err as Error).message }, 502)
  }
})

// tracks a signature the client is holding after /dfns/sign returned pending. it
// reads the current dfns status so the ui can show the hash once a human approves.
app.get('/dfns/sign/:id/status', rateLimit, tokenGuard, async (c) => {
  const walletId = process.env.DFNS_STELLAR_WALLET_ID
  if (!walletId) return c.json({ error: 'DFNS_STELLAR_WALLET_ID not set' }, 503)
  const id = c.req.param('id')
  if (!id) return c.json({ error: 'missing signature id' }, 400)
  try {
    const s = await getSignatureStatus(walletId, id)
    if (isTerminal(s.status)) clearPending(walletId)
    return c.json({ status: s.status, txHash: s.txHash, reason: s.reason })
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
    // one record per settled tx: the lifecycle also emits requested/broadcasted,
    // which carry no txHash and would double-count the same trade under evt.id.
    .filter((e) => e.kind === 'wallet.transaction.confirmed' || e.kind === 'wallet.transfer.confirmed')
    .map((e) => eventToSnapshot(e))
    .filter((s): s is StellarTxSnapshot => !!s)
  // one continuous hash chain across every tx so the whole export verifies
  // end to end rather than breaking at each tx boundary.
  const records: ReturnType<typeof buildMcaRecords> = []
  let prevHash: string | null = null
  for (const s of snapshots) {
    const recs = buildMcaRecords(s, ctx, prevHash)
    if (recs.length) prevHash = recs[recs.length - 1].recordHash
    records.push(...recs)
  }
  // never ship a broken audit trail. a corrupt chain means a bug upstream,
  // and a wrong mica export is worse than a failed request.
  const broken = verifyChain(records)
  if (broken !== -1) return c.json({ error: `mica export chain broke at record ${broken}` }, 500)
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
