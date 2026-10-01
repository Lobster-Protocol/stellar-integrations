import { describe, it, expect, afterEach } from 'vitest'
import {
  hasFeeReserve, formatMetrics, rpcLedgerClose, horizonLedgerClose, type ScanResult,
} from '../probe/index'
import { accountTargets, httpTargets } from '../probe/targets'
import { STELLAR_CCTP_DOMAIN } from '../../src/config/contracts'

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
    const cctp = httpTargets().filter((t) => t.area === 'bridge')
    expect(cctp.map((t) => t.name).sort()).toEqual(['circle-cctp-mainnet', 'circle-cctp-testnet'])
    for (const t of cctp) {
      expect(t.probe).toBe('cctp')
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
})
