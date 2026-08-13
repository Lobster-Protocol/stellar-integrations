import { describe, it, expect } from 'vitest'
import { decimalToStroops, stroopsToDecimal } from '../amount'

describe('decimalToStroops', () => {
  it('parses whole and fractional amounts to stroops', () => {
    expect(decimalToStroops('1')).toBe(10_000_000n)
    expect(decimalToStroops('12.42')).toBe(124_200_000n)
    expect(decimalToStroops('0.0000001')).toBe(1n)
  })

  it('rejects a fraction longer than 7 digits rather than truncating', () => {
    expect(() => decimalToStroops('1.00000001')).toThrow(/valid stellar amount/i)
  })

  it('rejects negatives and non-decimal input', () => {
    expect(() => decimalToStroops('-1')).toThrow()
    expect(() => decimalToStroops('0x1')).toThrow()
  })
})

describe('stroopsToDecimal', () => {
  it('renders stroops as an exact 7-decimal string', () => {
    expect(stroopsToDecimal(10_000_000n)).toBe('1.0000000')
    expect(stroopsToDecimal(124_200_000n)).toBe('12.4200000')
    expect(stroopsToDecimal(1n)).toBe('0.0000001')
    expect(stroopsToDecimal(0n)).toBe('0.0000000')
  })

  it('round-trips with decimalToStroops', () => {
    for (const v of ['0.0000000', '1.0000000', '9991.5000000', '12.4200000']) {
      expect(stroopsToDecimal(decimalToStroops(v))).toBe(v)
    }
  })
})
