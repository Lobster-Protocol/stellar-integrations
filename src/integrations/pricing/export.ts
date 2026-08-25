import type { Network } from '../../config/contracts'
import { shortenAddress } from '../../utils/format'
import { toCsv } from '../../utils/csv'
import { VENUE_LABEL } from '../lobster/position'
import { tokenLabel } from '../stellar/token-registry'
import {
  keyCode,
  valueAtCurrentPrice,
  type AssetKey,
  type BalancePoint,
  type XlmFlows,
} from './history'
import type { Portfolio } from './portfolio'
import type { PriceUnit, ValuedBalance } from './price'

export const HOLDINGS_COLUMNS = [
  'Location',
  'Venue',
  'Asset',
  'Issuer or contract',
  'Amount',
  'Unit price',
  'Value',
  'Currency',
  'Share of portfolio (%)',
]

function pct(value: number, total: number): string {
  return total > 0 ? ((value / total) * 100).toFixed(2) : '0.00'
}

// Float arithmetic leaves tails like 0.17870360000000002, which reads as false
// precision in a spreadsheet. Twelve significant digits keeps every figure a
// price or a valuation can carry and drops the noise.
function num(n: number): number {
  return Number.parseFloat(n.toPrecision(12))
}

function unitPrice(value: number | null, amount: string): number | '' {
  const held = Number(amount)
  if (value == null || !Number.isFinite(held) || held <= 0) return ''
  return num(value / held)
}

// What the wallet holds right now, loose balances and vault legs in one shape so
// a sheet can total them together. Nothing gets a value it doesn't have: a token
// with no market pool comes through with an amount and empty price columns.
// No total row either, because a stray total breaks a pivot table.
export function holdingsRows(
  lines: ValuedBalance[],
  p: Portfolio,
  priceOf: (tokenId: string) => number | null,
  unit: PriceUnit,
  network: Network,
): Array<Array<string | number>> {
  const rows: Array<Array<string | number>> = []

  for (const l of lines) {
    if (Number(l.balance) <= 0) continue
    rows.push([
      'Wallet',
      'Wallet',
      l.code,
      l.issuer ?? (l.isNative ? 'native' : ''),
      l.balance,
      unitPrice(l.usd, l.balance),
      l.usd == null ? '' : num(l.usd),
      l.usd == null ? '' : unit,
      l.usd == null ? '' : pct(l.usd, p.total),
    ])
  }

  for (const { vault } of p.vaults) {
    const where = `Vault ${shortenAddress(vault.address, 6, 4)}`
    const legs: Array<[string, string]> = [
      [vault.token0, vault.amount0],
      [vault.token1, vault.amount1],
    ]
    for (const [id, amount] of legs) {
      if (Number(amount) <= 0) continue
      const price = priceOf(id)
      const value = price == null ? null : Number(amount) * price
      rows.push([
        where,
        VENUE_LABEL[vault.venue],
        tokenLabel(id, network) ?? shortenAddress(id, 6, 4),
        id,
        amount,
        price == null ? '' : num(price),
        value == null ? '' : num(value),
        value == null ? '' : unit,
        value == null ? '' : pct(value, p.total),
      ])
    }
  }

  return rows
}

// Value history, one row per moment a balance actually moved. Rows between moves
// would only repeat a number the reader can already infer. The value column is
// named the way it is on purpose: past holdings priced at today's rate is what
// the chart draws, and that is not what they were worth at the time.
export function valueHistoryColumns(assetKeys: AssetKey[]): string[] {
  return [
    'Timestamp (UTC)',
    'Date (UTC)',
    ...assetKeys.map((k) => `${keyCode(k)} held`),
    "Value at today's price",
    'Currency',
  ]
}

export function valueHistoryRows(
  points: BalancePoint[],
  assetKeys: AssetKey[],
  priceByKey: Record<string, number>,
  unit: PriceUnit,
): Array<Array<string | number>> {
  return points.map((p) => {
    const iso = new Date(p.ts).toISOString()
    return [
      iso,
      iso.slice(0, 10),
      ...assetKeys.map((k) => p.held[k] ?? 0),
      num(valueAtCurrentPrice(p, priceByKey)),
      unit,
    ]
  })
}

export function valueHistoryCsv(
  points: BalancePoint[],
  assetKeys: AssetKey[],
  priceByKey: Record<string, number>,
  unit: PriceUnit,
): string {
  return toCsv(valueHistoryColumns(assetKeys), valueHistoryRows(points, assetKeys, priceByKey, unit))
}

// The JSON side also carries the reconciliation: the lines that explain why a
// falling curve is not a loss.
export function performanceJson(
  args: {
    account: string
    network: Network
    unit: PriceUnit
    points: BalancePoint[]
    priceByKey: Record<string, number>
    flows?: XlmFlows
    complete: boolean
  },
  at = new Date(),
): string {
  return JSON.stringify(
    {
      account: args.account,
      network: args.network,
      generatedAt: at.toISOString(),
      quotedIn: args.unit,
      source: 'horizon effects and transaction fees, replayed client side',
      complete: args.complete,
      xlmReconciliation: args.flows ?? null,
      points: args.points.map((p) => ({
        at: new Date(p.ts).toISOString(),
        held: p.held,
        value: num(valueAtCurrentPrice(p, args.priceByKey)),
      })),
    },
    null,
    2,
  )
}
