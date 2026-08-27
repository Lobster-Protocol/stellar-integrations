import { describe, it, expect } from 'vitest'

import { valueVault, vaultLegs, type VaultPosition } from '../position'
import { buildPortfolio } from '../../pricing/portfolio'

const XLM = 'CXLM'
const LOBS = 'CLOBS'

function vault(over: Partial<VaultPosition> = {}): VaultPosition {
  return {
    address: 'CVAULT',
    owner: 'GOWNER',
    token0: XLM,
    token1: LOBS,
    venue: 'idle',
    amount0: '100',
    amount1: '0',
    pooled0: null,
    pooled1: null,
    poolAddress: null,
    lpShares: null,
    complete: true,
    ...over,
  }
}

// one unit of XLM is worth two, LOBS has no market
const priceOf = (id: string) => (id === XLM ? 2 : null)

describe('vaultLegs', () => {
  it('reports only what the vault holds while it is idle', () => {
    expect(vaultLegs(vault())).toEqual([
      [XLM, '100'],
      [LOBS, '0'],
    ])
  })

  it('adds the pool position once the vault is working', () => {
    const legs = vaultLegs(
      vault({ venue: 'soroswap', amount0: '1', amount1: '0', pooled0: '400', pooled1: '900' }),
    )
    expect(legs).toEqual([
      [XLM, '1'],
      [LOBS, '0'],
      [XLM, '400'],
      [LOBS, '900'],
    ])
  })
})

describe('valueVault', () => {
  it('values an idle vault from its own balances', () => {
    expect(valueVault(vault(), priceOf)).toEqual({ value: 200, partial: false })
  })

  it('does not report a working vault as empty', () => {
    // get_amounts_tokens is the balance held outside any pool, so a deployed
    // vault reads near zero there and used to show up as worth nothing
    const working = vault({
      venue: 'soroswap',
      amount0: '0',
      amount1: '0',
      pooled0: '500',
      pooled1: '1000',
      poolAddress: 'CPOOL',
    })
    expect(valueVault(working, priceOf).value).toBe(1000)
  })

  it('flags a working vault whose pool would not answer', () => {
    const silent = vault({ venue: 'soroswap', amount0: '0', amount1: '0', poolAddress: 'CPOOL' })
    const out = valueVault(silent, priceOf)
    expect(out.value).toBe(0)
    expect(out.partial).toBe(true)
  })

  it('flags a leg it cannot price, pooled or not', () => {
    expect(valueVault(vault({ amount1: '50' }), priceOf).partial).toBe(true)
    const working = vault({ venue: 'soroswap', pooled0: '10', pooled1: '5' })
    expect(valueVault(working, priceOf).partial).toBe(true)
  })
})

describe('buildPortfolio with a working vault', () => {
  const working = vault({
    venue: 'soroswap',
    amount0: '0',
    amount1: '0',
    pooled0: '500',
    pooled1: '1000',
    poolAddress: 'CPOOL',
  })

  it('counts the pool position in the total', () => {
    const p = buildPortfolio([], [working], priceOf, 'testnet')
    expect(p.vaultValue).toBe(1000)
    expect(p.total).toBe(1000)
  })

  it('gives the venue its weight rather than leaving it at zero', () => {
    const p = buildPortfolio([], [working], priceOf, 'testnet')
    expect(p.byVenue).toEqual([{ name: 'Soroswap', value: 1000 }])
  })

  it('weights the asset split by what the pool holds', () => {
    const p = buildPortfolio([], [working], priceOf, 'testnet')
    const xlm = p.byAsset.find((a) => a.value === 1000)
    expect(xlm).toBeDefined()
  })
})
