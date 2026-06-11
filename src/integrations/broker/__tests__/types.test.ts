import { describe, it, expect } from 'vitest'
import { BrokerQuoteParamsSchema, BrokerQuoteResultSchema } from '../types'

describe('BrokerQuoteParamsSchema', () => {
  const ok = {
    sellingAsset: 'xlm',
    buyingAsset: 'USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    sellingAmount: '100',
    slippageTolerance: 0.02,
  }

  it('accepts a well-formed param set', () => {
    expect(() => BrokerQuoteParamsSchema.parse(ok)).not.toThrow()
  })

  it('accepts omitting amount and slippage', () => {
    expect(() => BrokerQuoteParamsSchema.parse({ sellingAsset: 'xlm', buyingAsset: 'USDC-G...' })).not.toThrow()
  })

  it('rejects empty asset strings', () => {
    expect(() => BrokerQuoteParamsSchema.parse({ ...ok, sellingAsset: '' })).toThrow()
    expect(() => BrokerQuoteParamsSchema.parse({ ...ok, buyingAsset: '' })).toThrow()
  })

  it('rejects slippage outside 0..1', () => {
    expect(() => BrokerQuoteParamsSchema.parse({ ...ok, slippageTolerance: -0.01 })).toThrow()
    expect(() => BrokerQuoteParamsSchema.parse({ ...ok, slippageTolerance: 1.5 })).toThrow()
  })
})

describe('BrokerQuoteResultSchema', () => {
  const baseSuccess = {
    ts: new Date(),
    status: 'success',
    sellingAsset: 'xlm',
    buyingAsset: 'USDC-G...',
    slippageTolerance: 0.02,
    sellingAmount: '100',
    estimatedBuyingAmount: '23.45',
    profit: '0.42',
  }

  it('parses a success quote with directTrade omitted', () => {
    expect(() => BrokerQuoteResultSchema.parse(baseSuccess)).not.toThrow()
  })

  it('parses an unfeasible quote without estimatedBuyingAmount', () => {
    expect(() =>
      BrokerQuoteResultSchema.parse({
        ts: new Date(),
        status: 'unfeasible',
        sellingAsset: 'xlm',
        buyingAsset: 'USDC-G...',
        slippageTolerance: 0.02,
        sellingAmount: '100',
        profit: '0',
        error: 'no path',
      }),
    ).not.toThrow()
  })

  it('coerces an iso-string timestamp to Date', () => {
    const parsed = BrokerQuoteResultSchema.parse({ ...baseSuccess, ts: '2026-06-02T10:00:00Z' })
    expect(parsed.ts).toBeInstanceOf(Date)
  })

  it('rejects an unknown status', () => {
    expect(() => BrokerQuoteResultSchema.parse({ ...baseSuccess, status: 'pending' })).toThrow()
  })
})
