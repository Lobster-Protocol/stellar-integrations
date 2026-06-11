// per-browser routing decision log. lightweight on purpose: routing is
// driven by the broker server-side, the local log is just a UX trace
// of what was attempted, not an authoritative audit.

const KEY = 'lob_routing_log'
const LIVE_KEY = 'lob_activity_live'
const MAX = 50

export type RoutingPath = 'broker' | 'soroswap-fallback'

export interface RoutingEntry {
  ts: number
  path: RoutingPath
  sellingAsset: string
  buyingAsset: string
  sellingAmount: string
  buyingAmount?: string
  txHash?: string
  network: 'testnet' | 'mainnet'
}

// activity feed mirror entry, kept in sync with src/data/mock.ts ActivityEvent
export interface LiveActivityEntry {
  id: string
  date: string
  type: 'swap_routed' | 'sign'
  txHash: string
  via?: 'broker' | 'soroswap-fallback'
  signer?: 'wallet-kit' | 'dfns'
  soldAsset?: string
  boughtAsset?: string
  soldAmount?: string
  boughtAmount?: string
}

export function readRoutingLog(): RoutingEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as RoutingEntry[]) : []
  } catch {
    return []
  }
}

export function appendRoutingEntry(entry: RoutingEntry): RoutingEntry[] {
  const next = [entry, ...readRoutingLog()].slice(0, MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // localStorage quota, ignore. routing still works.
  }
  mirrorToActivityFeed(entry)
  return next
}

function mirrorToActivityFeed(entry: RoutingEntry): void {
  if (typeof window === 'undefined') return
  const live: LiveActivityEntry = {
    id: `live-${entry.ts}-${entry.path}`,
    date: new Date(entry.ts).toISOString().slice(0, 10),
    type: 'swap_routed',
    txHash: entry.txHash ?? `pending-${entry.ts}`,
    via: entry.path,
    soldAsset: entry.sellingAsset,
    boughtAsset: entry.buyingAsset,
    soldAmount: entry.sellingAmount,
    boughtAmount: entry.buyingAmount,
  }
  try {
    const raw = localStorage.getItem(LIVE_KEY)
    const arr = raw ? (JSON.parse(raw) as LiveActivityEntry[]) : []
    const merged = [live, ...arr].slice(0, MAX)
    localStorage.setItem(LIVE_KEY, JSON.stringify(merged))
  } catch {
    // ignore quota
  }
}

export function readLiveActivity(): LiveActivityEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(LIVE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as LiveActivityEntry[]) : []
  } catch {
    return []
  }
}

export function clearRoutingLog(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
