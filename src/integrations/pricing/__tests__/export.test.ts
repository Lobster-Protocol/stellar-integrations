import { describe, it, expect } from 'vitest'

import {
  HOLDINGS_COLUMNS,
  holdingsRows,
  valueHistoryColumns,
  valueHistoryRows,
} from '../export'
import type { Portfolio } from '../portfolio'
import type { ValuedBalance } from '../price'
import type { VaultPosition } from '../../lobster/position'

const col = (name: string) => HOLDINGS_COLUMNS.indexOf(name)
const AMOUNT = col('Amount')
const PRICE = col('Unit price')
const VALUE = col('Value')
const CURRENCY = col('Currency')
const SHARE = col('Share of portfolio (%)')
const VENUE = col('Venue')
const ASSET = col('Asset')

function vault(over: Partial<VaultPosition> = {}): VaultPosition {
  return {
    address: 'CVAULTAAAAAAAAAA',
    owner: 'GOWNER',
    token0: 'CTOKEN0',
    token1: 'CTOKEN1',
    venue: 'soroswap',
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

function portfolio(over: Partial<Portfolio> = {}): Portfolio {
  return {
    walletValue: 0,
    vaultValue: 0,
    total: 100,
    byAsset: [],
    byVenue: [],
    unpriced: [],
    vaults: [],
    ...over,
  }
}

const line = (over: Partial<ValuedBalance>): ValuedBalance => ({
  code: 'XLM',
  balance: '50',
  isNative: true,
  usd: 25,
  ...over,
})

describe('holdingsRows', () => {
  it('prices a wallet line and states its share', () => {
    const rows = holdingsRows([line({})], portfolio(), () => null, 'USDC', 'testnet')
    expect(rows).toHaveLength(1)
    expect(rows[0][AMOUNT]).toBe('50')
    expect(rows[0][PRICE]).toBe(0.5)
    expect(rows[0][VALUE]).toBe(25)
    expect(rows[0][CURRENCY]).toBe('USDC')
    expect(rows[0][SHARE]).toBe('25.00')
  })

  it('leaves the money columns empty for a token with no price', () => {
    const rows = holdingsRows(
      [line({ code: 'LOBS', isNative: false, issuer: 'GLOBS', usd: null })],
      portfolio(),
      () => null,
      'USDC',
      'testnet',
    )
    expect(rows[0][AMOUNT]).toBe('50')
    expect(rows[0][PRICE]).toBe('')
    expect(rows[0][VALUE]).toBe('')
    expect(rows[0][CURRENCY]).toBe('')
    expect(rows[0][SHARE]).toBe('')
  })

  it('skips a balance the wallet no longer holds', () => {
    expect(holdingsRows([line({ balance: '0' })], portfolio(), () => null, 'USDC', 'testnet')).toEqual(
      [],
    )
  })

  it('lists a vault leg under its venue and drops the empty side', () => {
    const rows = holdingsRows(
      [],
      portfolio({ vaults: [{ vault: vault(), value: 40, partial: false }] }),
      (id) => (id === 'CTOKEN0' ? 0.4 : null),
      'USDC',
      'testnet',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0][VENUE]).toBe('Soroswap')
    expect(rows[0][VALUE]).toBe(40)
    expect(String(rows[0][ASSET])).toContain('CTOKEN')
  })
})

describe('valueHistoryRows', () => {
  const keys = ['XLM', 'USDC|GISSUER']

  it('names a column per asset, by code', () => {
    expect(valueHistoryColumns(keys)).toContain('XLM held')
    expect(valueHistoryColumns(keys)).toContain('USDC held')
  })

  it('reports zero for an asset a point does not carry', () => {
    const rows = valueHistoryRows([{ ts: 0, held: { XLM: 12 } }], keys, { XLM: 2 }, 'USD')
    expect(rows[0].slice(2, 4)).toEqual([12, 0])
  })

  it('values a point with the price map it was given', () => {
    const rows = valueHistoryRows(
      [{ ts: 0, held: { XLM: 10, 'USDC|GISSUER': 5 } }],
      keys,
      { XLM: 2, 'USDC|GISSUER': 1 },
      'USD',
    )
    expect(rows[0].at(-2)).toBe(25)
    expect(rows[0].at(-1)).toBe('USD')
  })

  it('stamps each row with the moment it came from', () => {
    const rows = valueHistoryRows([{ ts: Date.UTC(2026, 7, 20, 9, 30), held: {} }], [], {}, 'USD')
    expect(rows[0][0]).toBe('2026-08-20T09:30:00.000Z')
    expect(rows[0][1]).toBe('2026-08-20')
  })
})
