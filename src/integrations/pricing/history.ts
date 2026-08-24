import { useQuery } from '@tanstack/react-query'
import { NotFoundError } from '@stellar/stellar-sdk'

import type { Network } from '../../config/contracts'
import { getHorizonServer } from '../horizon/client'
import { getAccountBalances } from '../horizon/account'
import { decimalToStroops, stroopsToDecimal } from '../stellar/amount'

// Horizon's own ceiling per page, and how many pages we are willing to walk
// before saying the series is clipped rather than quietly showing half a history.
const PAGE = 200
const MAX_PAGES = 3

// Assets are keyed by code AND issuer, never by code alone: an account can hold
// a token that calls itself USDC from any issuer, and pricing that at par would
// let a worthless look-alike inflate the curve.
export type AssetKey = string

export function assetKey(code: string, issuer?: string): AssetKey {
  return issuer ? `${code}|${issuer}` : code
}

export function keyCode(key: AssetKey): string {
  return key.split('|')[0]
}

export interface BalancePoint {
  ts: number
  held: Record<AssetKey, number>
}

export interface BalanceHistory {
  points: BalancePoint[]
  // false when we hit MAX_PAGES and the oldest moves are missing
  complete: boolean
  reachesAccountCreation: boolean
}

interface Delta {
  ts: number
  key: AssetKey
  // signed, in stroops
  amount: bigint
}

// Effects carry every credit and debit but never the fee, and a fee-only
// transaction (a TTL extend) moves the balance without producing any effect at
// all. Replaying effects alone drifts by exactly the fees paid; adding
// fee_charged per transaction the account itself sourced closes the gap to the
// stroop, which is what makes this series trustworthy rather than indicative.
async function collectDeltas(
  network: Network,
  account: string,
): Promise<{ deltas: Delta[]; complete: boolean; created: boolean }> {
  const server = getHorizonServer(network)
  const deltas: Delta[] = []
  let created = false

  let effPages = 0
  let effCursor = ''
  let effComplete = false
  while (effPages < MAX_PAGES) {
    let call = server.effects().forAccount(account).order('desc').limit(PAGE)
    if (effCursor) call = call.cursor(effCursor)
    const page = await call.call()
    for (const e of page.records) {
      const ts = new Date(e.created_at).getTime()
      if (e.type === 'account_credited' || e.type === 'account_debited') {
        const key =
          e.asset_type === 'native'
            ? 'XLM'
            : assetKey(e.asset_code ?? 'unknown', e.asset_issuer)
        const raw = decimalToStroops(e.amount)
        deltas.push({ ts, key, amount: e.type === 'account_credited' ? raw : -raw })
      } else if (e.type === 'account_created') {
        deltas.push({ ts, key: 'XLM', amount: decimalToStroops(e.starting_balance) })
        created = true
      }
    }
    effPages += 1
    effCursor = page.records.at(-1)?.paging_token ?? ''
    if (page.records.length < PAGE) {
      effComplete = true
      break
    }
  }

  let txPages = 0
  let txCursor = ''
  let txComplete = false
  while (txPages < MAX_PAGES) {
    let call = server.transactions().forAccount(account).order('desc').limit(PAGE)
    if (txCursor) call = call.cursor(txCursor)
    const page = await call.call()
    for (const t of page.records) {
      // the fee leaves the source account, which is not always this one
      if (t.source_account !== account) continue
      deltas.push({
        ts: new Date(t.created_at).getTime(),
        key: 'XLM',
        amount: -BigInt(t.fee_charged),
      })
    }
    txPages += 1
    txCursor = page.records.at(-1)?.paging_token ?? ''
    if (page.records.length < PAGE) {
      txComplete = true
      break
    }
  }

  return { deltas, complete: effComplete && txComplete, created }
}

export async function getBalanceHistory(
  network: Network,
  account: string,
): Promise<BalanceHistory> {
  let balances
  try {
    balances = await getAccountBalances(network, account)
  } catch (err) {
    if (err instanceof NotFoundError) return { points: [], complete: true, reachesAccountCreation: false }
    throw err
  }
  if (balances.length === 0) return { points: [], complete: true, reachesAccountCreation: false }

  const { deltas, complete, created } = await collectDeltas(network, account)
  if (deltas.length === 0) return { points: [], complete, reachesAccountCreation: created }

  // Horizon only reports classic balances, so a soroban-only token (testnet
  // USDC) has no effect trail to walk. Track the assets we can actually replay.
  const tracked = new Set(deltas.map((d) => d.key))
  const running = new Map<AssetKey, bigint>()
  for (const b of balances) {
    const key = b.isNative ? 'XLM' : assetKey(b.code, b.issuer)
    if (tracked.has(key)) running.set(key, decimalToStroops(b.balance))
  }
  for (const key of tracked) if (!running.has(key)) running.set(key, 0n)

  const snapshot = (ts: number): BalancePoint => ({
    ts,
    held: Object.fromEntries([...running].map(([k, v]) => [k, Number(stroopsToDecimal(v))])),
  })

  // newest first, so walking the list undoes each move and lands on the balance
  // that stood just before it
  deltas.sort((a, b) => b.ts - a.ts)
  const points: BalancePoint[] = [snapshot(Date.now())]
  for (let i = 0; i < deltas.length; i++) {
    const d = deltas[i]
    running.set(d.key, (running.get(d.key) ?? 0n) - d.amount)
    // several deltas share a timestamp (a swap's debit and its fee); only record
    // once the whole moment has been undone
    if (deltas[i + 1]?.ts === d.ts) continue
    points.push(snapshot(d.ts))
  }

  points.reverse()
  return { points, complete, reachesAccountCreation: created }
}

export function useBalanceHistory(network: Network, account: string | null) {
  return useQuery<BalanceHistory>({
    queryKey: ['balance-history', network, account],
    queryFn: () => getBalanceHistory(network, account!),
    enabled: !!account,
    staleTime: 5 * 60_000,
    retry: 1,
  })
}

// Value a point with today's prices. There is no historical price feed on
// Stellar we can read from the browser, so the curve shows how the holdings
// themselves moved, with the market held still. Callers must say so.
export function valueAtCurrentPrice(
  point: BalancePoint,
  priceByKey: Record<AssetKey, number>,
): number {
  let total = 0
  for (const [key, amount] of Object.entries(point.held)) {
    const p = priceByKey[key]
    if (p != null) total += amount * p
  }
  return total
}
