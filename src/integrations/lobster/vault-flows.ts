import { useQuery } from '@tanstack/react-query'
import { NotFoundError } from '@stellar/stellar-sdk'

import type { Network } from '../../config/contracts'
import { getHorizonServer } from '../horizon/client'
import { toActivityEvent, type ActivityEvent } from '../horizon/activity'
import { useAccountExists } from '../horizon/account'
import { decimalToStroops, stroopsToDecimal } from '../stellar/amount'

// Horizon's ceiling per page, and how far back we walk before calling the trail
// clipped rather than quietly counting from halfway through.
const PAGE = 200
const MAX_PAGES = 3

export interface VaultMove {
  ts: number
  vault: string
  code: string
  // signed stroops, positive into the vault. bigint so a long trail sums exactly
  amount: bigint
}

export interface VaultFlows {
  moves: VaultMove[]
  // false when we stopped at MAX_PAGES and older operations are still out there
  complete: boolean
}

// only a contract can be a vault, so an account counterparty is a plain payment.
// a zero line is a leg the call declared and never touched
export function movesFromEvents(events: ActivityEvent[]): VaultMove[] {
  const out: VaultMove[] = []
  for (const e of events) {
    if (!e.ok) continue
    const ts = new Date(e.at).getTime()
    if (!Number.isFinite(ts)) continue
    for (const m of e.moves) {
      if (!m.counterparty?.startsWith('C')) continue
      let size: bigint
      try {
        size = decimalToStroops(m.amount)
      } catch {
        // an amount we cannot read exactly is one we will not put in a total
        continue
      }
      if (size === 0n) continue
      out.push({
        ts,
        vault: m.counterparty,
        code: m.code,
        amount: m.direction === 'out' ? size : -size,
      })
    }
  }
  return out.sort((a, b) => a.ts - b.ts)
}

export async function getVaultFlows(network: Network, account: string): Promise<VaultFlows> {
  const server = getHorizonServer(network)
  const events: ActivityEvent[] = []
  let pages = 0
  let cursor = ''
  let complete = false

  try {
    while (pages < MAX_PAGES) {
      let call = server.operations().forAccount(account).order('desc').limit(PAGE)
      if (cursor) call = call.cursor(cursor)
      const page = await call.call()
      for (const r of page.records) events.push(toActivityEvent(r, account))
      pages += 1
      cursor = page.records.at(-1)?.paging_token ?? ''
      if (page.records.length < PAGE) {
        complete = true
        break
      }
    }
  } catch (err) {
    if (!(err instanceof NotFoundError)) throw err
    return { moves: [], complete: true }
  }

  return { moves: movesFromEvents(events), complete }
}

// one per moment something moved; codes that sat still carry their last total
export interface FlowPoint {
  ts: number
  net: Record<string, number>
}

export interface VaultFlowSeries {
  // asset codes in the order the panels should read
  codes: string[]
  points: FlowPoint[]
  // exact 7-decimal strings, ready for formatBalance
  putIn: Record<string, string>
  takenBack: Record<string, string>
  net: Record<string, string>
  count: number
}

// null when nothing moved with this vault, so callers show an empty state rather
// than a flat line at zero. `prefer` is the vault's pair, so panels keep the card's
// order, and any other code falls in behind it, busiest first
export function vaultFlowSeries(
  moves: VaultMove[],
  vault: string,
  prefer: Array<string | null> = [],
): VaultFlowSeries | null {
  const mine = moves.filter((m) => m.vault === vault).sort((a, b) => a.ts - b.ts)
  if (mine.length === 0) return null

  const volume: Record<string, bigint> = {}
  const putIn: Record<string, bigint> = {}
  const takenBack: Record<string, bigint> = {}
  for (const m of mine) {
    const size = m.amount < 0n ? -m.amount : m.amount
    volume[m.code] = (volume[m.code] ?? 0n) + size
    if (m.amount > 0n) putIn[m.code] = (putIn[m.code] ?? 0n) + size
    else takenBack[m.code] = (takenBack[m.code] ?? 0n) + size
  }

  const wanted = prefer.filter((c): c is string => !!c)
  const rank = (c: string) => {
    const i = wanted.indexOf(c)
    return i === -1 ? wanted.length : i
  }
  const codes = Object.keys(volume).sort(
    (a, b) => rank(a) - rank(b) || (volume[a] > volume[b] ? -1 : volume[a] < volume[b] ? 1 : 0),
  )

  const running: Record<string, bigint> = {}
  for (const c of codes) running[c] = 0n

  const points: FlowPoint[] = []
  for (let i = 0; i < mine.length; i++) {
    running[mine[i].code] += mine[i].amount
    // several codes move in one call, so only record once the whole moment is in
    if (mine[i + 1]?.ts === mine[i].ts) continue
    points.push({
      ts: mine[i].ts,
      net: Object.fromEntries(codes.map((c) => [c, Number(stroopsToDecimal(running[c]))])),
    })
  }

  const decimals = (totals: Record<string, bigint>) =>
    Object.fromEntries(codes.map((c) => [c, stroopsToDecimal(totals[c] ?? 0n)]))

  return {
    codes,
    points,
    putIn: decimals(putIn),
    takenBack: decimals(takenBack),
    net: decimals(running),
    count: mine.length,
  }
}

export function useVaultFlows(network: Network, account: string | null) {
  // an unfunded wallet has no operations to walk, and asking Horizon just 404s
  const exists = useAccountExists(network, account) === 'live'
  // one key for the whole page: a wallet with six vaults renders six cards, and
  // they all read the same operation list, so react-query serves one request
  return useQuery<VaultFlows>({
    queryKey: ['lobster', 'vault-flows', network, account],
    queryFn: () => getVaultFlows(network, account!),
    enabled: !!account && exists,
    // focus refetch is off app-wide, so a new deposit shows up on the next mount once stale
    staleTime: 60_000,
    retry: 1,
  })
}
