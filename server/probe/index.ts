import {
  rpc, Contract, Address, TransactionBuilder, BASE_FEE, Networks,
  nativeToScVal, scValToNative, xdr,
} from '@stellar/stellar-sdk'
import { CONTRACTS, STELLAR_RPC_FALLBACK } from '../../src/config/contracts'
import { httpTargets, accountTargets, type HttpTarget, type AccountTarget } from './targets'

export interface ProbeResult {
  name: string
  deliverable: string
  up: boolean
  latencySeconds: number
}

export interface AccountReading {
  role: string
  network: string
  exists: boolean
  xlm: number
  usdc?: number
}

export interface ScanResult {
  probes: ProbeResult[]
  accounts: AccountReading[]
}

const TIMEOUT_MS = 10_000

async function timed<T>(fn: () => Promise<T>): Promise<{ ok: boolean; value?: T; seconds: number }> {
  const start = Date.now()
  try {
    const value = await fn()
    return { ok: true, value, seconds: (Date.now() - start) / 1000 }
  } catch {
    return { ok: false, seconds: (Date.now() - start) / 1000 }
  }
}

async function probeOne(t: HttpTarget): Promise<ProbeResult> {
  const r = await timed(async () => {
    if (t.probe === 'rpc') {
      const res = await fetch(t.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth' }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      })
      const body = (await res.json()) as { result?: { status?: string } }
      return res.ok && body.result?.status === 'healthy'
    }
    const res = await fetch(t.url, { method: 'GET', signal: AbortSignal.timeout(TIMEOUT_MS) })
    // a 404 at a root or a 401 from an api still proves the host answered;
    // only a network error or a 5xx is down
    return res.status > 0 && res.status < 500
  })
  return { name: t.name, deliverable: t.deliverable, up: r.ok && r.value === true, latencySeconds: r.seconds }
}

// synthetic D3.AC2 fallback check: the Soroswap router still quoting a mainnet
// XLM->USDC swap. the stale xlmSac SAC broke exactly this once (get_pair Error
// #205), so it gets its own watch.
async function probeSoroswap(): Promise<ProbeResult | null> {
  const tokens = CONTRACTS.mainnet.tokens
  const routerId = CONTRACTS.mainnet.soroswap.router
  // the simulate just needs a funded mainnet account to read from. the treasury
  // is the convenient one, but don't hinge the check on it: an env without a
  // treasury should read as "not watched" here, not as a dead router.
  const caller =
    process.env.MONITOR_SOROSWAP_SOURCE || accountTargets().find((a) => a.role === 'dfns-treasury')?.address
  if (!caller || !tokens.xlmSac || !tokens.usdcSac || !routerId) return null
  const rpcUrl = process.env.SOROBAN_RPC_MAINNET || STELLAR_RPC_FALLBACK.mainnet.soroban
  const r = await timed(async () => {
    const server = new rpc.Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://'), timeout: TIMEOUT_MS })
    const source = await server.getAccount(caller)
    const path = xdr.ScVal.scvVec([
      Address.fromString(tokens.xlmSac).toScVal(),
      Address.fromString(tokens.usdcSac).toScVal(),
    ])
    const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: Networks.PUBLIC })
      .addOperation(new Contract(routerId).call('router_get_amounts_out', nativeToScVal(10_000_000n, { type: 'i128' }), path))
      .setTimeout(30)
      .build()
    const sim = await server.simulateTransaction(tx)
    if (rpc.Api.isSimulationError(sim) || !sim.result) return false
    const amounts = scValToNative(sim.result.retval) as bigint[]
    return amounts.length > 0 && amounts[amounts.length - 1] > 0n
  })
  return {
    name: 'soroswap-xlm-usdc-pair',
    deliverable: 'D3',
    up: r.ok && r.value === true,
    latencySeconds: r.seconds,
  }
}

// horizon account payload -> the balances we track. split out so a test hits
// the parsing without a network call.
export function parseBalances(
  payload: { balances?: Array<{ asset_type: string; balance: string; asset_code?: string; asset_issuer?: string }> },
  usdcIssuer?: string,
): { xlm: number; usdc?: number } {
  let xlm = 0
  let usdc: number | undefined
  for (const b of payload.balances ?? []) {
    if (b.asset_type === 'native') xlm = Number(b.balance)
    else if (usdcIssuer && b.asset_code === 'USDC' && b.asset_issuer === usdcIssuer) usdc = Number(b.balance)
  }
  return { xlm, usdc }
}

async function readAccount(a: AccountTarget): Promise<AccountReading> {
  const horizon = STELLAR_RPC_FALLBACK[a.network].horizon
  const r = await timed(async () => {
    const res = await fetch(`${horizon}/accounts/${a.address}`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (res.status === 404) return { exists: false as const }
    if (!res.ok) throw new Error(`horizon ${res.status}`)
    const body = (await res.json()) as Parameters<typeof parseBalances>[0]
    return { exists: true as const, ...parseBalances(body, a.usdcIssuer) }
  })
  if (!r.ok || !r.value) return { role: a.role, network: a.network, exists: false, xlm: 0 }
  if (!r.value.exists) return { role: a.role, network: a.network, exists: false, xlm: 0 }
  return { role: a.role, network: a.network, exists: true, xlm: r.value.xlm, usdc: r.value.usdc }
}

export async function scan(): Promise<ScanResult> {
  const [probes, accounts, soroswap] = await Promise.all([
    Promise.all(httpTargets().map(probeOne)),
    Promise.all(accountTargets().map(readAccount)),
    probeSoroswap(),
  ])
  return { probes: soroswap ? [...probes, soroswap] : probes, accounts }
}

// prometheus exposition for a scan: up + latency per target, balances and an
// exists flag per account.
export function formatMetrics(s: ScanResult): string {
  const lines = [
    '# HELP lobster_probe_up dependency reachable (1) or down (0)',
    '# TYPE lobster_probe_up gauge',
    ...s.probes.map((p) => `lobster_probe_up{target="${p.name}",deliverable="${p.deliverable}"} ${p.up ? 1 : 0}`),
    '# HELP lobster_probe_latency_seconds round trip to the dependency',
    '# TYPE lobster_probe_latency_seconds gauge',
    ...s.probes.map((p) => `lobster_probe_latency_seconds{target="${p.name}",deliverable="${p.deliverable}"} ${p.latencySeconds}`),
    '# HELP lobster_account_exists tracked account funded/exists on chain',
    '# TYPE lobster_account_exists gauge',
    ...s.accounts.map((a) => `lobster_account_exists{role="${a.role}",network="${a.network}"} ${a.exists ? 1 : 0}`),
    '# HELP lobster_account_balance balance of a tracked account by asset',
    '# TYPE lobster_account_balance gauge',
    ...s.accounts.map((a) => `lobster_account_balance{role="${a.role}",network="${a.network}",asset="XLM"} ${a.xlm}`),
    ...s.accounts
      .filter((a) => a.usdc !== undefined)
      .map((a) => `lobster_account_balance{role="${a.role}",network="${a.network}",asset="USDC"} ${a.usdc}`),
  ]
  return lines.join('\n') + '\n'
}

export async function pushMetrics(url: string, s: ScanResult): Promise<void> {
  const res = await fetch(`${url.replace(/\/$/, '')}/metrics/job/lobster-probe`, {
    method: 'POST',
    headers: { 'content-type': 'text/plain' },
    body: formatMetrics(s),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`pushgateway answered ${res.status}`)
}
