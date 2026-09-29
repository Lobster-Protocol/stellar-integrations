import { useQuery } from '@tanstack/react-query'
import { NotFoundError } from '@stellar/stellar-sdk'

import type { Network } from '../../config/contracts'
import { getHorizonServer } from '../horizon/client'
import { getAccountBalances, useAccountExists } from '../horizon/account'
import { decimalToStroops, stroopsToDecimal } from '../stellar/amount'

// Horizon's own ceiling per page, and how many pages we are willing to walk
// before saying the series is clipped rather than quietly showing half a history.
const PAGE = 200
const MAX_PAGES = 3

// code and issuer, never code alone: anyone can issue a token called USDC, and
// pricing a worthless look-alike at par would inflate the curve
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
  flows: XlmFlows
}

// where every stroop of XLM went, so a falling curve reads as swapped or parked
// in a vault rather than lost; the lines must add up to Horizon's live balance
export interface XlmFlows {
  receivedOutside: string
  sentOutside: string
  intoContracts: string
  fromContracts: string
  // a TTL extend costs orders of magnitude more than a fee; lumped in with fees,
  // one rent payment makes the account look like it bleeds fees
  storageRent: string
  txFees: string
  heldNow: string
  reconciles: boolean
}

const ZERO_FLOWS: XlmFlows = {
  receivedOutside: '0.0000000',
  sentOutside: '0.0000000',
  intoContracts: '0.0000000',
  fromContracts: '0.0000000',
  storageRent: '0.0000000',
  txFees: '0.0000000',
  heldNow: '0.0000000',
  reconciles: false,
}

// operations whose whole cost is storage rent rather than a transaction fee
const RENT_OPS = new Set(['extend_footprint_ttl', 'bump_footprint_expiration', 'restore_footprint'])

interface Delta {
  ts: number
  key: AssetKey
  // signed, in stroops
  amount: bigint
}

// effects never include the fee, and a fee-only transaction (a TTL extend) has no
// effects at all, so fee_charged comes from each transaction this account sourced
async function collectDeltas(
  network: Network,
  account: string,
): Promise<{ deltas: Delta[]; complete: boolean; created: boolean; flows: XlmFlows }> {
  const server = getHorizonServer(network)
  const deltas: Delta[] = []
  let created = false

  // an effect id is "<operation id>-<index>"; a contract effect in the same
  // operation as our credit or debit means the value went to or from a contract
  const contractOps = new Set<string>()
  let receivedOutside = 0n
  let sentOutside = 0n
  let intoContracts = 0n
  let fromContracts = 0n
  const nativeMoves: Array<{ op: string; amount: bigint; credited: boolean; created: boolean }> = []

  let effPages = 0
  let effCursor = ''
  let effComplete = false
  while (effPages < MAX_PAGES) {
    let call = server.effects().forAccount(account).order('desc').limit(PAGE)
    if (effCursor) call = call.cursor(effCursor)
    const page = await call.call()
    for (const e of page.records) {
      const ts = new Date(e.created_at).getTime()
      const op = e.id.split('-')[0]
      if (e.type.startsWith('contract_')) contractOps.add(op)
      if (e.type === 'account_credited' || e.type === 'account_debited') {
        const key =
          e.asset_type === 'native'
            ? 'XLM'
            : assetKey(e.asset_code ?? 'unknown', e.asset_issuer)
        const raw = decimalToStroops(e.amount)
        const credited = e.type === 'account_credited'
        deltas.push({ ts, key, amount: credited ? raw : -raw })
        if (key === 'XLM') nativeMoves.push({ op, amount: raw, credited, created: false })
      } else if (e.type === 'account_created') {
        const raw = decimalToStroops(e.starting_balance)
        deltas.push({ ts, key: 'XLM', amount: raw })
        nativeMoves.push({ op, amount: raw, credited: true, created: true })
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

  // a transaction's fee does not say what it bought, so read the operations to
  // tell a rent prepayment apart from an ordinary fee
  const rentTx = new Set<string>()
  let opPages = 0
  let opCursor = ''
  while (opPages < MAX_PAGES) {
    let call = server.operations().forAccount(account).order('desc').limit(PAGE)
    if (opCursor) call = call.cursor(opCursor)
    const page = await call.call()
    for (const o of page.records) if (RENT_OPS.has(o.type)) rentTx.add(o.transaction_hash)
    opPages += 1
    opCursor = page.records.at(-1)?.paging_token ?? ''
    if (page.records.length < PAGE) break
  }

  let rentTotal = 0n
  let feeTotal = 0n
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
      if (rentTx.has(t.hash)) rentTotal += BigInt(t.fee_charged)
      else feeTotal += BigInt(t.fee_charged)
    }
    txPages += 1
    txCursor = page.records.at(-1)?.paging_token ?? ''
    if (page.records.length < PAGE) {
      txComplete = true
      break
    }
  }

  for (const m of nativeMoves) {
    const internal = !m.created && contractOps.has(m.op)
    if (m.credited) {
      if (internal) fromContracts += m.amount
      else receivedOutside += m.amount
    } else if (internal) {
      intoContracts += m.amount
    } else {
      sentOutside += m.amount
    }
  }

  const heldNow =
    receivedOutside - sentOutside - intoContracts + fromContracts - feeTotal - rentTotal
  const flows: XlmFlows = {
    receivedOutside: stroopsToDecimal(receivedOutside),
    sentOutside: stroopsToDecimal(sentOutside),
    intoContracts: stroopsToDecimal(intoContracts),
    fromContracts: stroopsToDecimal(fromContracts),
    storageRent: stroopsToDecimal(rentTotal),
    txFees: stroopsToDecimal(feeTotal),
    heldNow: stroopsToDecimal(heldNow),
    reconciles: false,
  }

  return { deltas, complete: effComplete && txComplete, created, flows }
}

export async function getBalanceHistory(
  network: Network,
  account: string,
): Promise<BalanceHistory> {
  let balances
  try {
    balances = await getAccountBalances(network, account)
  } catch (err) {
    if (err instanceof NotFoundError)
      return { points: [], complete: true, reachesAccountCreation: false, flows: ZERO_FLOWS }
    throw err
  }
  if (balances.length === 0)
    return { points: [], complete: true, reachesAccountCreation: false, flows: ZERO_FLOWS }

  const { deltas, complete, created, flows } = await collectDeltas(network, account)

  // the flows only mean anything if they land on the live balance
  const liveNative = balances.find((b) => b.isNative)?.balance ?? '0'
  flows.reconciles = complete && flows.heldNow === stroopsToDecimal(decimalToStroops(liveNative))

  if (deltas.length === 0) return { points: [], complete, reachesAccountCreation: created, flows }

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
  return { points, complete, reachesAccountCreation: created, flows }
}

// carries holdings forward so quiet stretches still give the cursor a point;
// never interpolate, that would draw a number the account never had
export function densify(points: BalancePoint[], target = 320): BalancePoint[] {
  if (points.length < 2) return points
  const first = points[0].ts
  const last = points[points.length - 1].ts
  const span = last - first
  if (span <= 0 || points.length >= target) return points

  const step = span / target
  const out: BalancePoint[] = []
  let i = 0
  let held = points[0].held

  for (let t = first; t < last; t += step) {
    // emit every real change that falls before this tick, so the step edges stay
    // exactly where they happened
    while (i < points.length && points[i].ts <= t) {
      held = points[i].held
      if (out[out.length - 1]?.ts !== points[i].ts) out.push(points[i])
      i += 1
    }
    if (out[out.length - 1]?.ts !== t) out.push({ ts: Math.round(t), held })
  }

  while (i < points.length) {
    out.push(points[i])
    i += 1
  }
  return out
}

export function useBalanceHistory(network: Network, account: string | null) {
  // a wallet with no funds has no history and is not on-chain, so skip the
  // ledger replay until balances confirm the account exists.
  const exists = useAccountExists(network, account) === 'live'
  return useQuery<BalanceHistory>({
    queryKey: ['balance-history', network, account],
    queryFn: () => getBalanceHistory(network, account!),
    enabled: !!account && exists,
    staleTime: 5 * 60_000,
    retry: 1,
  })
}

// there is no historical price feed we can read from the browser, so every point
// is valued at today's prices with the market held still; callers must say so
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
