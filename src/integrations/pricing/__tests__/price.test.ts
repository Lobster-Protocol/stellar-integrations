import { describe, it, expect, vi, beforeEach } from 'vitest'

import { fetchXlmPrice, usdcAtPar, valueBalances } from '../price'
import { CONTRACTS } from '../../../config/contracts'
import type { AccountBalance } from '../../horizon/account'
import { quoteBroker } from '../../broker/quote'
import { quoteSoroswapDirect } from '../../broker/soroswap-fallback'

vi.mock('../../broker/quote', () => ({ quoteBroker: vi.fn() }))
vi.mock('../../broker/soroswap-fallback', () => ({ quoteSoroswapDirect: vi.fn() }))

// what the live broker returns for 100 XLM against mainnet USDC
function quote(over: Record<string, unknown> = {}) {
  return {
    ts: new Date(),
    status: 'success',
    sellingAsset: 'XLM',
    buyingAsset: 'USDC-GISSUER',
    slippageTolerance: 0.02,
    sellingAmount: '100',
    estimatedBuyingAmount: '19.016611',
    profit: '0.0203821',
    ...over,
  }
}

describe('fetchXlmPrice on mainnet', () => {
  beforeEach(() => vi.clearAllMocks())

  it('asks the broker for a size it will actually price', async () => {
    vi.mocked(quoteBroker).mockResolvedValue(quote() as never)
    await fetchXlmPrice('mainnet')
    // one XLM is worth cents, and the broker refuses anything under a dollar
    expect(vi.mocked(quoteBroker).mock.calls[0][0].sellingAmount).toBe('100')
  })

  it('divides the quote back down to one unit', async () => {
    vi.mocked(quoteBroker).mockResolvedValue(quote() as never)
    expect(await fetchXlmPrice('mainnet')).toBeCloseTo(0.19016611, 8)
  })

  it('returns nothing when the broker turns the quote down', async () => {
    vi.mocked(quoteBroker).mockResolvedValue(
      quote({ status: 'rejected', estimatedBuyingAmount: undefined }) as never,
    )
    expect(await fetchXlmPrice('mainnet')).toBe(null)
  })

  it('returns nothing when there is no quote at all', async () => {
    vi.mocked(quoteBroker).mockResolvedValue(null)
    expect(await fetchXlmPrice('mainnet')).toBe(null)
  })

  it('refuses a quote that carries no amount rather than reporting zero', async () => {
    vi.mocked(quoteBroker).mockResolvedValue(quote({ estimatedBuyingAmount: '0' }) as never)
    expect(await fetchXlmPrice('mainnet')).toBe(null)
    vi.mocked(quoteBroker).mockResolvedValue(quote({ estimatedBuyingAmount: 'n/a' }) as never)
    expect(await fetchXlmPrice('mainnet')).toBe(null)
  })
})

describe('fetchXlmPrice on testnet', () => {
  beforeEach(() => vi.clearAllMocks())

  it('reads the Soroswap pool and never calls the broker', async () => {
    vi.mocked(quoteSoroswapDirect).mockResolvedValue(1_787_036n)
    expect(await fetchXlmPrice('testnet')).toBeCloseTo(0.1787036, 7)
    expect(quoteBroker).not.toHaveBeenCalled()
  })

  it('returns nothing when the pool cannot fill the probe', async () => {
    vi.mocked(quoteSoroswapDirect).mockResolvedValue(null)
    expect(await fetchXlmPrice('testnet')).toBe(null)
    vi.mocked(quoteSoroswapDirect).mockResolvedValue(0n)
    expect(await fetchXlmPrice('testnet')).toBe(null)
  })
})

describe('valueBalances', () => {
  const circle = CONTRACTS.testnet.cctp.usdcIssuer
  const line = (over: Partial<AccountBalance>): AccountBalance =>
    ({ code: 'USDC', issuer: circle, balance: '312.5', isNative: false, ...over }) as AccountBalance

  it('counts the USDC the bridge mints at par on testnet', () => {
    const { usdTotal, lines } = valueBalances([line({})], null, 'testnet')
    expect(lines[0].usd).toBe(312.5)
    expect(usdTotal).toBe(312.5)
  })

  it('still counts Soroswap test USDC at par on testnet', () => {
    const { lines } = valueBalances([line({ issuer: CONTRACTS.testnet.tokens.usdcSac })], null, 'testnet')
    expect(lines[0].usd).toBe(312.5)
  })

  it('gives a look-alike USDC under another issuer no price', () => {
    const { lines, usdTotal } = valueBalances([line({ issuer: 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU' })], null, 'testnet')
    expect(lines[0].usd).toBeNull()
    expect(usdTotal).toBeNull()
  })

  it('has one USDC id on mainnet, Circle being the network issuer there', () => {
    expect([...usdcAtPar('mainnet')]).toEqual([CONTRACTS.mainnet.tokens.usdcIssuer])
  })
})
