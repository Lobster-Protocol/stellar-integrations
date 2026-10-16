import { describe, it, expect } from 'vitest'

import { vaultSplit } from '../vault-split'

const XLM = 'CXLM'
const USDC = 'CUSDC'
const prices = (id: string) => (id === XLM ? 0.18 : id === USDC ? 1 : null)

function vault(amount0: string, amount1: string, pooled0: string | null, pooled1: string | null) {
  return { token0: XLM, token1: USDC, amount0, amount1, pooled0, pooled1 }
}

describe('where a vault keeps its value', () => {
  it('says nothing until the pool has answered', () => {
    expect(vaultSplit(vault('5', '1', null, null), prices)).toBeNull()
  })

  it('puts it in the pool when nothing sits idle', () => {
    expect(vaultSplit(vault('0', '0', '4.98', '1.1'), prices)).toBe('pool')
  })

  it('puts it in the vault when a large deposit has not gone to the pool yet', () => {
    // about $180 idle against $2 in the pool
    expect(vaultSplit(vault('1000', '0', '5.51', '1.0065'), prices)).toBe('vault')
  })

  it('keeps the pool when only dust is left idle', () => {
    expect(vaultSplit(vault('0.0000001', '0', '4.98', '1.1'), prices)).toBe('pool')
  })

  it('says both hold some when a price is missing', () => {
    expect(vaultSplit(vault('1000', '0', '5.51', '1.0065'), () => null)).toBe('both')
  })

  it('puts it in the vault when the pool answers with nothing', () => {
    expect(vaultSplit(vault('2', '0.4', '0', '0'), prices)).toBe('vault')
  })

  it('says nothing for an empty vault', () => {
    expect(vaultSplit(vault('0', '0', '0', '0'), prices)).toBeNull()
  })
})
