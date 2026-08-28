import { describe, it, expect } from 'vitest'

import { simulateBridgeQuote } from '../simulate'

describe('simulateBridgeQuote', () => {
  it('takes a ~0.3% fee off the amount and quotes six decimals', () => {
    const q = simulateBridgeQuote('100')
    expect(q.amountInFloat).toBe('100')
    expect(q.amountOutFloat).toBe('99.700000')
    expect(q.trustlineRequired).toBe(false)
  })

  it('returns zero out for a non-positive or unparseable amount', () => {
    expect(simulateBridgeQuote('0').amountOutFloat).toBe('0.000000')
    expect(simulateBridgeQuote('abc').amountOutFloat).toBe('0.000000')
    expect(simulateBridgeQuote('-5').amountOutFloat).toBe('0.000000')
  })

  it('carries a realistic eta and a stablecoin gas figure', () => {
    const q = simulateBridgeQuote('50')
    expect(q.estimatedTimeSeconds).toBe(120)
    expect(q.gasFeeOptions.stablecoin).toBe('4.50')
  })
})
