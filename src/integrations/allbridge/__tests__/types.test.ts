import { describe, it, expect } from 'vitest'
import {
  BridgeRequestSchema,
  EvmSourceChain,
  stellarAccountIdRegex,
} from '../types'

describe('EvmSourceChain', () => {
  it('accepts the three supported EVM source chains', () => {
    expect(EvmSourceChain.parse('ETH')).toBe('ETH')
    expect(EvmSourceChain.parse('ARB')).toBe('ARB')
    expect(EvmSourceChain.parse('BSC')).toBe('BSC')
  })

  it('rejects unsupported chains', () => {
    expect(() => EvmSourceChain.parse('SOL')).toThrow()
    expect(() => EvmSourceChain.parse('AVAX')).toThrow()
  })
})

describe('stellarAccountIdRegex', () => {
  it('matches a valid G-address', () => {
    const valid = 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU'
    expect(stellarAccountIdRegex.test(valid)).toBe(true)
  })

  it('rejects a C-address (contract id)', () => {
    const contract = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'
    expect(stellarAccountIdRegex.test(contract)).toBe(false)
  })

  it('rejects an EVM address', () => {
    expect(stellarAccountIdRegex.test('0x1234567890abcdef1234567890abcdef12345678')).toBe(false)
  })

  it('rejects strings of the wrong length', () => {
    expect(stellarAccountIdRegex.test('G' + 'A'.repeat(50))).toBe(false)
    expect(stellarAccountIdRegex.test('G' + 'A'.repeat(60))).toBe(false)
  })
})

describe('BridgeRequestSchema', () => {
  const validReq = {
    sourceChain: 'ARB' as const,
    amount: '100',
    fromAddress: '0x1234567890abcdef1234567890abcdef12345678',
    toAddress: 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU',
  }

  it('accepts a well-formed request', () => {
    expect(() => BridgeRequestSchema.parse(validReq)).not.toThrow()
  })

  it('accepts a decimal amount', () => {
    expect(() => BridgeRequestSchema.parse({ ...validReq, amount: '0.5' })).not.toThrow()
    expect(() => BridgeRequestSchema.parse({ ...validReq, amount: '1.25' })).not.toThrow()
  })

  it('rejects negative or scientific notation amounts', () => {
    expect(() => BridgeRequestSchema.parse({ ...validReq, amount: '-1' })).toThrow()
    expect(() => BridgeRequestSchema.parse({ ...validReq, amount: '1e6' })).toThrow()
  })

  it('rejects an invalid EVM address (no 0x prefix)', () => {
    expect(() =>
      BridgeRequestSchema.parse({ ...validReq, fromAddress: '1234567890abcdef1234567890abcdef12345678' }),
    ).toThrow()
  })

  it('rejects an invalid Stellar account id (wrong format)', () => {
    expect(() =>
      BridgeRequestSchema.parse({ ...validReq, toAddress: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC' }),
    ).toThrow()
    expect(() =>
      BridgeRequestSchema.parse({ ...validReq, toAddress: 'not-a-stellar-address' }),
    ).toThrow()
  })
})
