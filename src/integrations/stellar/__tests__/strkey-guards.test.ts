import { describe, it, expect } from 'vitest'

import {
  assertContractId,
  assertAccountId,
  isContractId,
  isAccountId,
  InvalidStellarIdError,
} from '../strkey-guards'

const G_ADDR = 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU'
const C_ADDR = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'

describe('assertContractId', () => {
  it('returns the value for a valid C-address', () => {
    expect(assertContractId(C_ADDR)).toBe(C_ADDR)
  })

  it('throws on a G-address passed as a contract', () => {
    expect(() => assertContractId(G_ADDR)).toThrow(InvalidStellarIdError)
  })

  it('throws on a malformed string', () => {
    expect(() => assertContractId('not-a-contract')).toThrow(InvalidStellarIdError)
  })

  it('throws on empty and null', () => {
    expect(() => assertContractId('')).toThrow(InvalidStellarIdError)
    expect(() => assertContractId(null)).toThrow(InvalidStellarIdError)
  })
})

describe('assertAccountId', () => {
  it('returns the value for a valid G-address', () => {
    expect(assertAccountId(G_ADDR)).toBe(G_ADDR)
  })

  it('throws on a C-address passed as an account', () => {
    expect(() => assertAccountId(C_ADDR)).toThrow(InvalidStellarIdError)
  })

  it('throws on a checksum-broken G-address', () => {
    const corrupt = G_ADDR.slice(0, -1) + (G_ADDR.endsWith('U') ? 'V' : 'U')
    expect(() => assertAccountId(corrupt)).toThrow(InvalidStellarIdError)
  })
})

describe('isContractId / isAccountId', () => {
  it('returns boolean without throwing', () => {
    expect(isContractId(C_ADDR)).toBe(true)
    expect(isContractId(G_ADDR)).toBe(false)
    expect(isAccountId(G_ADDR)).toBe(true)
    expect(isAccountId(C_ADDR)).toBe(false)
  })
})
