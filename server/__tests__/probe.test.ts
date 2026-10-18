import { describe, it, expect, afterEach, vi } from 'vitest'
import {
  hasFeeReserve, formatMetrics, rpcLedgerClose, horizonLedgerClose, evmBlockFresh, confirmed, confirmPause, type ScanResult,
} from '../probe/index'
import { accountTargets, httpTargets } from '../probe/targets'
import { CCTP_SOURCE_CHAINS, STELLAR_CCTP_DOMAIN } from '../../src/config/contracts'

describe('hasFeeReserve', () => {
  it('holds the native balance against the reserve', () => {
    expect(hasFeeReserve({ balances: [{ asset_type: 'native', balance: '12.5' }] }, 10)).toBe(true)
    expect(hasFeeReserve({ balances: [{ asset_type: 'native', balance: '9.99' }] }, 10)).toBe(false)
  })

  it('ignores every other asset', () => {
    const payload = {
      balances: [
        { asset_type: 'native', balance: '1' },
        { asset_type: 'credit_alphanum4', balance: '500' },
      ],
    }
    expect(hasFeeReserve(payload, 10)).toBe(false)
  })

  it('treats an account with no balances array as empty', () => {
    expect(hasFeeReserve({}, 10)).toBe(false)
  })
})

describe('formatMetrics', () => {
  const sample: ScanResult = {
    probes: [
      { name: 'frontend', area: 'frontend', up: true, latencySeconds: 0.2 },
      { name: 'dfns-api', area: 'custody', up: false, latencySeconds: 10 },
    ],
    accounts: [
      { role: 'dfns-treasury', network: 'mainnet', exists: true, reserveOk: true },
      { role: 'dfns-wallet', network: 'testnet', exists: true, reserveOk: false },
    ],
  }

  it('emits up, latency, exists and fee reserve gauges with labels', () => {
    const out = formatMetrics(sample)
    expect(out).toContain('lobster_probe_up{target="frontend",area="frontend"} 1')
    expect(out).toContain('lobster_probe_up{target="dfns-api",area="custody"} 0')
    expect(out).toContain('lobster_probe_latency_seconds{target="dfns-api",area="custody"} 10')
    expect(out).toContain('lobster_account_fee_reserve_ok{role="dfns-treasury",network="mainnet"} 1')
    expect(out).toContain('lobster_account_fee_reserve_ok{role="dfns-wallet",network="testnet"} 0')
  })

  it('never pushes an amount', () => {
    expect(formatMetrics(sample)).not.toMatch(/balance|asset=/)
  })

  it('adds ledger age, protocol and vendor lines only where there is a reading', () => {
    const out = formatMetrics({
      probes: [
        { name: 'horizon-mainnet', area: 'mainnet', up: true, latencySeconds: 0.3, ledgerAgeSeconds: 4.5, protocolVersion: 28 },
        { name: 'stellar-broker', area: 'swap', up: true, latencySeconds: 0.4 },
      ],
      accounts: [],
      vendors: [{ vendor: 'circle', component: 'cctp-sandbox', level: 4 }],
    })
    expect(out).toContain('lobster_probe_ledger_age_seconds{target="horizon-mainnet",area="mainnet"} 4.5')
    expect(out).toContain('lobster_probe_protocol_version{target="horizon-mainnet",area="mainnet"} 28')
    expect(out).toContain('lobster_vendor_status{vendor="circle",component="cctp-sandbox"} 4')
    expect(out).not.toMatch(/lobster_probe_ledger_age_seconds\{target="stellar-broker"/)
  })
})

describe('ledger close time', () => {
  it('reads rpc seconds, given as a number or a string', () => {
    expect(rpcLedgerClose({ result: { latestLedgerCloseTime: '1790000000' } })).toBe(1790000000)
    expect(rpcLedgerClose({ result: { latestLedgerCloseTime: 1790000000 } })).toBe(1790000000)
  })

  it('reads the horizon root timestamp', () => {
    expect(horizonLedgerClose({ history_latest_ledger_closed_at: '2026-09-28T18:58:52Z' })).toBe(
      Date.UTC(2026, 8, 28, 18, 58, 52) / 1000,
    )
  })

  it('gives nothing back for a missing or garbled time', () => {
    expect(rpcLedgerClose({})).toBeUndefined()
    expect(rpcLedgerClose({ result: { latestLedgerCloseTime: 'soon' } })).toBeUndefined()
    expect(horizonLedgerClose({})).toBeUndefined()
    expect(horizonLedgerClose({ history_latest_ledger_closed_at: 'soon' })).toBeUndefined()
  })
})

describe('httpTargets', () => {
  it('asks Circle for the bridge fee quote on both networks', () => {
    const cctp = httpTargets().filter((t) => t.probe === 'cctp')
    expect(cctp.map((t) => t.name).sort()).toEqual(['circle-cctp-mainnet', 'circle-cctp-testnet'])
    for (const t of cctp) {
      expect(t.area).toBe('bridge')
      expect(t.url).toMatch(new RegExp(`^https://iris-api(-sandbox)?\\.circle\\.com/v2/burn/USDC/fees/\\d+/${STELLAR_CCTP_DOMAIN}$`))
    }
  })

  it('checks the public status page only when it is named, and wants it to load', () => {
    const old = process.env.MONITOR_STATUS_PAGE_URL
    try {
      delete process.env.MONITOR_STATUS_PAGE_URL
      expect(httpTargets().some((t) => t.name === 'status-page')).toBe(false)
      process.env.MONITOR_STATUS_PAGE_URL = 'https://status.example/board'
      expect(httpTargets().find((t) => t.name === 'status-page')).toMatchObject({
        url: 'https://status.example/board',
        probe: 'page',
        area: 'frontend',
      })
    } finally {
      if (old === undefined) delete process.env.MONITOR_STATUS_PAGE_URL
      else process.env.MONITOR_STATUS_PAGE_URL = old
    }
  })

  it('reads ledger age off both rpc endpoints and both horizons', () => {
    const byName = new Map(httpTargets().map((t) => [t.name, t.probe]))
    expect(byName.get('soroban-rpc-mainnet')).toBe('rpc')
    expect(byName.get('soroban-rpc-testnet')).toBe('rpc')
    expect(byName.get('horizon-mainnet')).toBe('horizon')
    expect(byName.get('horizon-testnet')).toBe('horizon')
  })
})

describe('accountTargets', () => {
  const OLD_GUARD = process.env.DFNS_TREASURY_ADDRESS
  const OLD_MONITOR = process.env.MONITOR_TREASURY_ADDRESS
  afterEach(() => {
    if (OLD_GUARD === undefined) delete process.env.DFNS_TREASURY_ADDRESS
    else process.env.DFNS_TREASURY_ADDRESS = OLD_GUARD
    if (OLD_MONITOR === undefined) delete process.env.MONITOR_TREASURY_ADDRESS
    else process.env.MONITOR_TREASURY_ADDRESS = OLD_MONITOR
  })

  it('watches the mainnet treasury named for monitoring over the one the guard signs for', () => {
    process.env.DFNS_TREASURY_ADDRESS = 'GTESTNETTREASURY'
    process.env.MONITOR_TREASURY_ADDRESS = 'GMAINNETTREASURY'
    const t = accountTargets().find((a) => a.role === 'dfns-treasury')
    expect(t).toMatchObject({ network: 'mainnet', address: 'GMAINNETTREASURY' })
  })

  it('falls back to the guard treasury when nothing else is named', () => {
    process.env.DFNS_TREASURY_ADDRESS = 'GTREASURY'
    delete process.env.MONITOR_TREASURY_ADDRESS
    expect(accountTargets().find((a) => a.role === 'dfns-treasury')?.address).toBe('GTREASURY')
  })

  it('watches the rent payer against its own reserve, only once it is named', () => {
    const OLD = process.env.MONITOR_TTL_EXTENDER_ADDRESS
    delete process.env.MONITOR_TTL_EXTENDER_ADDRESS
    expect(accountTargets().some((a) => a.role === 'ttl-extender')).toBe(false)
    process.env.MONITOR_TTL_EXTENDER_ADDRESS = 'GEXTENDER'
    expect(accountTargets().find((a) => a.role === 'ttl-extender')).toEqual({
      role: 'ttl-extender',
      network: 'mainnet',
      address: 'GEXTENDER',
      reserveXlm: 25,
    })
    if (OLD === undefined) delete process.env.MONITOR_TTL_EXTENDER_ADDRESS
    else process.env.MONITOR_TTL_EXTENDER_ADDRESS = OLD
  })
})

describe('evm chains', () => {
  it('probes every bridge chain on the same two endpoints as the app', () => {
    const evm = httpTargets().filter((t) => t.probe === 'evm')
    const expected = (['mainnet', 'testnet'] as const).flatMap((network) =>
      CCTP_SOURCE_CHAINS[network].map((c) => ({
        name: `evm-${c.key.toLowerCase()}-${network}`,
        area: 'bridge',
        url: c.rpcFallback,
        fallbackUrl: c.rpcArchive,
        probe: 'evm',
      })),
    )
    expect(evm).toEqual(expected)
  })

  it('counts an endpoint as up only while its latest block is recent', () => {
    const now = 1_800_000_000
    const at = (seconds: number) => ({ result: { timestamp: `0x${seconds.toString(16)}` } })
    expect(evmBlockFresh(at(now - 30), now)).toBe(true)
    expect(evmBlockFresh(at(now - 3600), now)).toBe(false)
    expect(evmBlockFresh({ result: null }, now)).toBe(false)
    expect(evmBlockFresh({}, now)).toBe(false)
  })
})

describe('confirmed', () => {
  it('retries a failed check once and keeps the second result', async () => {
    const answers = [{ up: false, n: 1 }, { up: true, n: 2 }]
    const check = vi.fn(async () => answers.shift()!)
    expect(await confirmed(check, 0)).toEqual({ up: true, n: 2 })
    expect(check).toHaveBeenCalledTimes(2)
  })

  it('does not retry a passing check or a null one', async () => {
    const up = vi.fn(async () => ({ up: true }))
    expect(await confirmed(up, 0)).toEqual({ up: true })
    expect(up).toHaveBeenCalledTimes(1)
    const none = vi.fn(async () => null)
    expect(await confirmed(none, 0)).toBeNull()
    expect(none).toHaveBeenCalledTimes(1)
  })

  it('waits 15 s before retrying the status page', () => {
    expect(confirmPause({ probe: 'page' })).toBe(15_000)
    for (const probe of ['rpc', 'horizon', 'cctp', 'http', 'evm'] as const) expect(confirmPause({ probe })).toBe(2_000)
  })

  it('reports down when the second try fails too', async () => {
    const down = vi.fn(async () => ({ up: false }))
    expect(await confirmed(down, 0)).toEqual({ up: false })
    expect(down).toHaveBeenCalledTimes(2)
  })
})

