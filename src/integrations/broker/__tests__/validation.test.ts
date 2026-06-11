import { describe, it, expect } from 'vitest'

import { validateBrokerQuote, validateSoroswapQuote } from '../validation'
import type { BrokerQuoteResult } from '../types'

const base: BrokerQuoteResult = {
  ts: new Date(),
  status: 'success',
  sellingAsset: 'xlm',
  buyingAsset: 'USDC-G...',
  slippageTolerance: 0.02,
  sellingAmount: '100',
  estimatedBuyingAmount: '23.45',
  profit: '0.05',
}

describe('validateBrokerQuote', () => {
  it('passes a sane success quote', () => {
    expect(validateBrokerQuote(base)).toEqual({ ok: true })
  })

  it('fails when the quote is not success', () => {
    const r = validateBrokerQuote({ ...base, status: 'unfeasible' })
    expect(r.ok).toBe(false)
  })

  it('fails when the output amount is zero or missing', () => {
    expect(validateBrokerQuote({ ...base, estimatedBuyingAmount: '0' }).ok).toBe(false)
    expect(validateBrokerQuote({ ...base, estimatedBuyingAmount: undefined }).ok).toBe(false)
  })

  it('fails when slippage is above the configured max', () => {
    expect(validateBrokerQuote({ ...base, slippageTolerance: 0.1 }).ok).toBe(false)
  })

  it('fails when profit looks implausibly large', () => {
    expect(validateBrokerQuote({ ...base, profit: '1.5' }).ok).toBe(false)
    expect(validateBrokerQuote({ ...base, profit: '-1.5' }).ok).toBe(false)
  })

  it('fails when broker output is more than 3x the direct trade output', () => {
    const r = validateBrokerQuote({
      ...base,
      estimatedBuyingAmount: '100',
      directTrade: { selling: '100', buying: '10', path: ['xlm', 'USDC-G...'] },
    })
    expect(r.ok).toBe(false)
  })

  it('passes when broker output is comparable to direct trade', () => {
    const r = validateBrokerQuote({
      ...base,
      estimatedBuyingAmount: '23.5',
      directTrade: { selling: '100', buying: '23.0', path: ['xlm', 'USDC-G...'] },
    })
    expect(r.ok).toBe(true)
  })
})

describe('validateSoroswapQuote', () => {
  const okIn = {
    sellingStroops: 1_000_000_000n,
    buyingStroops: 234_500_000n,
    sellingAsset: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
    buyingAsset: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
  }

  it('passes a plausible same-decimal pair', () => {
    expect(validateSoroswapQuote(okIn).ok).toBe(true)
  })

  it('fails when buying stroops is zero or negative', () => {
    expect(validateSoroswapQuote({ ...okIn, buyingStroops: 0n }).ok).toBe(false)
  })

  it('fails when selling stroops is zero', () => {
    expect(validateSoroswapQuote({ ...okIn, sellingStroops: 0n }).ok).toBe(false)
  })

  it('fails when selling and buying assets are identical', () => {
    expect(validateSoroswapQuote({ ...okIn, buyingAsset: okIn.sellingAsset }).ok).toBe(false)
  })

  it('fails when output exceeds the 10x raw ratio ceiling', () => {
    expect(
      validateSoroswapQuote({ ...okIn, buyingStroops: okIn.sellingStroops * 11n }).ok,
    ).toBe(false)
  })

  it('fails when drift vs reference rate is above 50%', () => {
    const r = validateSoroswapQuote({ ...okIn, referenceRate: 0.05 })
    expect(r.ok).toBe(false)
  })

  it('passes when reference rate matches within 50%', () => {
    const r = validateSoroswapQuote({ ...okIn, referenceRate: 0.25 })
    expect(r.ok).toBe(true)
  })
})
