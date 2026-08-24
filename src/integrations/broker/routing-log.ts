// per-browser trace of attempted routes, not an authoritative audit

export const ROUTING_LOG_KEY = 'lob_routing_log'
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
    const raw = localStorage.getItem(ROUTING_LOG_KEY)
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
    localStorage.setItem(ROUTING_LOG_KEY, JSON.stringify(next))
  } catch {
    // localStorage quota, ignore. routing still works.
  }
  return next
}

// asset ids arrive as 'xlm' or 'CODE-ISSUER'; both routing cards render the same
// "amount CODE -> amount CODE" line off the code half.
export function routeAssetsLabel(e: RoutingEntry): string {
  const code = (asset: string) => asset.split('-')[0].toUpperCase()
  return `${e.sellingAmount} ${code(e.sellingAsset)} -> ${e.buyingAmount ?? '?'} ${code(e.buyingAsset)}`
}
