import { describe, it, expect } from 'vitest'
import { shortenAddress, cn, formatBalance } from './format'

describe('shortenAddress', () => {
  it('returns empty string for empty input', () => {
    expect(shortenAddress('')).toBe('')
  })

  it('shortens a Stellar G... address to its first and last 4 chars by default', () => {
    const addr = 'GABCDEFGH1234567890ABCDEFGH1234567890ABCDEFGH1234567890ABCD'
    expect(shortenAddress(addr)).toBe('GABC...ABCD')
  })

  it('respects a custom chars count', () => {
    const addr = 'GABCDEFGH1234567890ABCDEFGH1234567890ABCDEFGH1234567890ABCD'
    expect(shortenAddress(addr, 6)).toBe('GABCDE...90ABCD')
  })
})

describe('cn', () => {
  it('joins truthy class names with spaces', () => {
    expect(cn('a', 'b', 'c')).toBe('a b c')
  })

  it('filters out falsy values', () => {
    expect(cn('a', false, null, undefined, 'b')).toBe('a b')
  })

  it('returns empty string when nothing is truthy', () => {
    expect(cn(false, null, undefined)).toBe('')
  })
})

describe('formatBalance', () => {
  it('returns "0.00" for zero', () => {
    expect(formatBalance('0')).toBe('0.00')
    expect(formatBalance('0.0000000')).toBe('0.00')
  })
  it('formats amounts >= 1 with at most 4 decimals', () => {
    expect(formatBalance('100.5000000')).toBe('100.50')
    expect(formatBalance('1234.5678901')).toBe('1,234.5679')
  })
  it('formats sub-1 amounts with up to 7 decimals', () => {
    expect(formatBalance('0.0000123')).toBe('0.0000123')
  })
  it('falls back to the raw string for non-numeric input', () => {
    expect(formatBalance('not a number')).toBe('not a number')
  })
})
