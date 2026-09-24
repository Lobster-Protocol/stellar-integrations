import { useSyncExternalStore } from 'react'

import type { CctpFinality, Network } from '../../config/contracts'

// Between the burn and the delivery nothing on either chain remembers the
// transfer, so we do. Hashes and addresses only.

export type TransferStage = 'burned' | 'delivered'

export interface TrackedTransfer {
  // the EVM burn hash, unique per transfer
  id: `0x${string}`
  network: Network
  chainKey: string
  chainName: string
  sourceDomain: number
  // what the person typed, for display
  amount: string
  recipient: string
  finality: CctpFinality
  createdAt: number
  stage: TransferStage
  deliveredHash?: string
}

const EVENT = 'lob:cctp-transfers'

function key(network: Network): string {
  return `lob_cctp_transfers_${network}`
}

function read(network: Network): TrackedTransfer[] {
  try {
    const raw = localStorage.getItem(key(network))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // only keep entries of the right network, in case storage was edited by hand
    return parsed.filter(
      (t): t is TrackedTransfer =>
        !!t && typeof t === 'object' && (t as TrackedTransfer).network === network && typeof (t as TrackedTransfer).id === 'string',
    )
  } catch {
    return []
  }
}

function write(network: Network, list: TrackedTransfer[]): void {
  try {
    localStorage.setItem(key(network), JSON.stringify(list))
  } catch {
    // private mode or a full quota: the transfer still works, only resume is lost
  }
  cache.delete(network)
  window.dispatchEvent(new Event(EVENT))
}

export function trackTransfer(t: TrackedTransfer): void {
  const list = read(t.network).filter((x) => x.id !== t.id)
  write(t.network, [t, ...list].slice(0, 50))
}

export function markDelivered(network: Network, id: string, deliveredHash: string): void {
  write(
    network,
    read(network).map((t) => (t.id === id ? { ...t, stage: 'delivered', deliveredHash } : t)),
  )
}

export function forgetTransfer(network: Network, id: string): void {
  write(
    network,
    read(network).filter((t) => t.id !== id),
  )
}

export function listTransfers(network: Network): TrackedTransfer[] {
  return read(network)
}

// useSyncExternalStore needs the same array back until something changes, or
// it re-renders forever
const cache = new Map<Network, TrackedTransfer[]>()

function snapshot(network: Network): TrackedTransfer[] {
  const hit = cache.get(network)
  if (hit) return hit
  const fresh = read(network)
  cache.set(network, fresh)
  return fresh
}

function subscribe(onChange: () => void): () => void {
  const handler = () => {
    cache.clear()
    onChange()
  }
  window.addEventListener(EVENT, handler)
  // another tab finishing a transfer should show here too
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener(EVENT, handler)
    window.removeEventListener('storage', handler)
  }
}

const EMPTY: TrackedTransfer[] = []

export function useTrackedTransfers(network: Network): TrackedTransfer[] {
  return useSyncExternalStore(
    subscribe,
    () => snapshot(network),
    () => EMPTY,
  )
}
