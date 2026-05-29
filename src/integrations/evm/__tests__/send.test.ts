import { describe, it, expect } from 'vitest'
import { toViemTxArgs, toUsdcBaseUnits, type RawEvmTx } from '../send'

describe('toViemTxArgs', () => {
  it('maps every field with explicit chain id', () => {
    const raw: RawEvmTx = {
      from: '0xabc',
      to: '0x1234567890abcdef1234567890abcdef12345678',
      value: '0',
      data: '0xdeadbeef',
    }
    const out = toViemTxArgs(raw, 42161)
    expect(out).toEqual({
      chainId: 42161,
      to: '0x1234567890abcdef1234567890abcdef12345678',
      data: '0xdeadbeef',
      value: 0n,
    })
  })

  it('defaults data to 0x when omitted', () => {
    const raw: RawEvmTx = { to: '0xabcd' }
    expect(toViemTxArgs(raw, 1).data).toBe('0x')
  })

  it('coerces value string to bigint', () => {
    const raw: RawEvmTx = { to: '0xabcd', value: '1000000000000000000' }
    expect(toViemTxArgs(raw, 1).value).toBe(1_000_000_000_000_000_000n)
  })

  it('throws when `to` is missing', () => {
    expect(() => toViemTxArgs({} as RawEvmTx, 1)).toThrow(/missing `to`/)
  })

  it('defaults value to 0n when omitted', () => {
    expect(toViemTxArgs({ to: '0xabcd' }, 56).value).toBe(0n)
  })
})

describe('toUsdcBaseUnits (6 decimals)', () => {
  it('1 USDC = 1_000_000', () => {
    expect(toUsdcBaseUnits('1')).toBe(1_000_000n)
  })

  it('handles decimals up to 6 places', () => {
    expect(toUsdcBaseUnits('0.123456')).toBe(123_456n)
  })

  it('handles small fractional amounts', () => {
    expect(toUsdcBaseUnits('0.000001')).toBe(1n)
  })

  it('handles large amounts', () => {
    expect(toUsdcBaseUnits('1000000')).toBe(1_000_000_000_000n)
  })
})
