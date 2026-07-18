// per-browser trace of attempted routes, not an authoritative audit

const KEY = 'lob_routing_log'
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

export function readRoutingLog(): RoutingEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    // drop non-object rows, the cards dereference fields off each entry
    return parsed.filter((e) => e && typeof e === 'object') as RoutingEntry[]
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
  return next
}
