// per-browser trace of attempted routes, not an authoritative audit

import { tokenLabel } from '../stellar/token-registry'
import { isContractId } from '../stellar/strkey-guards'
import { shortenAddress } from '../../utils/format'

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

// Asset ids arrive in three shapes: 'xlm', 'CODE-ISSUER' on mainnet, and a bare
// SAC contract id on testnet where the broker is skipped. Splitting on the dash
// only works for the middle one - on testnet it printed the whole 56-character
// contract id as if it were a ticker.
export function assetCode(asset: string, network: RoutingEntry['network']): string {
  if (!asset) return '?'
  if (asset.includes('-')) return asset.split('-')[0].toUpperCase()
  if (isContractId(asset)) return tokenLabel(asset, network) ?? shortenAddress(asset)
  return asset.toUpperCase()
}

export function routeAssetsLabel(e: RoutingEntry): string {
  const sell = assetCode(e.sellingAsset, e.network)
  const buy = assetCode(e.buyingAsset, e.network)
  return `${e.sellingAmount} ${sell} -> ${e.buyingAmount ?? '?'} ${buy}`
}
