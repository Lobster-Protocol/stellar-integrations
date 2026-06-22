import { describe, it, expect } from 'vitest'
import { parseBalances, formatMetrics, type ScanResult } from '../probe/index'

describe('parseBalances', () => {
  const issuer = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'

  it('reads the native balance', () => {
    const r = parseBalances({ balances: [{ asset_type: 'native', balance: '12.5' }] })
    expect(r.xlm).toBe(12.5)
    expect(r.usdc).toBeUndefined()
  })

  it('reads USDC only from the matching issuer', () => {
    const r = parseBalances(
      {
        balances: [
          { asset_type: 'native', balance: '1' },
          { asset_type: 'credit_alphanum4', balance: '9.3', asset_code: 'USDC', asset_issuer: issuer },
          { asset_type: 'credit_alphanum4', balance: '99', asset_code: 'USDC', asset_issuer: 'GWRONG' },
        ],
      },
      issuer,
    )
    expect(r.xlm).toBe(1)
    expect(r.usdc).toBe(9.3)
  })

  it('handles an account with no balances array', () => {
    expect(parseBalances({})).toEqual({ xlm: 0, usdc: undefined })
  })
})

describe('formatMetrics', () => {
  const sample: ScanResult = {
    probes: [
      { name: 'frontend', deliverable: 'D2', up: true, latencySeconds: 0.2 },
      { name: 'dfns-api', deliverable: 'D4', up: false, latencySeconds: 10 },
    ],
    accounts: [
      { role: 'dfns-treasury', network: 'mainnet', exists: true, xlm: 20, usdc: 0.9 },
      { role: 'dfns-wallet', network: 'testnet', exists: true, xlm: 9997 },
    ],
  }

  it('emits up, latency, exists and balance gauges with labels', () => {
    const out = formatMetrics(sample)
    expect(out).toContain('lobster_probe_up{target="frontend",deliverable="D2"} 1')
    expect(out).toContain('lobster_probe_up{target="dfns-api",deliverable="D4"} 0')
    expect(out).toContain('lobster_probe_latency_seconds{target="dfns-api",deliverable="D4"} 10')
    expect(out).toContain('lobster_account_balance{role="dfns-treasury",network="mainnet",asset="XLM"} 20')
    expect(out).toContain('lobster_account_balance{role="dfns-treasury",network="mainnet",asset="USDC"} 0.9')
  })

  it('omits a USDC line when the account has no usdc reading', () => {
    const out = formatMetrics(sample)
    expect(out).not.toContain('role="dfns-wallet",network="testnet",asset="USDC"')
  })
})
