import { useSyncExternalStore } from 'react'

import type { CctpFinality, Network } from '../../config/contracts'

export type TransferStage = 'burned' | 'delivered'

// to-stellar: burned on an EVM chain, delivered on Stellar. from-stellar: the reverse
export type TransferDirection = 'to-stellar' | 'from-stellar'

// Between the burn and the delivery nothing on either chain remembers the
// transfer, so we do. Hashes and addresses only.
export interface TrackedTransfer {
  // the burn hash, unique per transfer: 0x-prefixed on an EVM chain, bare hex on Stellar
  id: string
  // entries saved before the way back existed have none, and were all bound for Stellar
  direction?: TransferDirection
  network: Network
  // the EVM chain at the other end, where the burn happened or where the USDC is minted
  chainKey: string
  chainName: string
  // Circle's number for the chain that burned: the EVM chain's, or Stellar's
  sourceDomain: number
  // what the person typed, for display
  amount: string
  // a Stellar account on the way in, an EVM address on the way out
  recipient: string
  finality: CctpFinality
  createdAt: number
  stage: TransferStage
  // on the way out, Circle mints on the EVM chain itself for a fee taken from the amount
  forwarded?: boolean
  // when Circle's signature was first seen, and when the USDC landed
  attestedAt?: number
  deliveredAt?: number
  deliveredHash?: string
  // a mint our EVM wallet sent: kept from the moment the wallet returns it, so a node
  // that fails to answer for its receipt does not lose the link to it
  sentHash?: string
}

export function directionOf(t: TrackedTransfer): TransferDirection {
  return t.direction ?? 'to-stellar'
}

const EVENT = 'lob:cctp-transfers'

function key(network: Network): string {
  return `lob_cctp_transfers_${network}`
}

// useSyncExternalStore needs the same array back until something changes, or
// it re-renders forever
const cache = new Map<Network, TrackedTransfer[]>()

export function listTransfers(network: Network): TrackedTransfer[] {
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
  const list = listTransfers(t.network).filter((x) => x.id !== t.id)
  write(t.network, [t, ...list].slice(0, 50))
}

function update(network: Network, id: string, change: (t: TrackedTransfer) => TrackedTransfer): void {
  const list = listTransfers(network)
  if (!list.some((t) => t.id === id)) return
  write(network, list.map((t) => (t.id === id ? change(t) : t)))
}

// the first time Circle's signature is seen; a later look keeps that time
export function markAttested(network: Network, id: string, at = Date.now()): void {
  const t = listTransfers(network).find((x) => x.id === id)
  if (!t || t.attestedAt) return
  update(network, id, (x) => ({ ...x, attestedAt: at }))
}

// an empty hash clears it: the mint reverted, or never left the wallet
export function markSent(network: Network, id: string, hash: string): void {
  update(network, id, (t) => ({ ...t, sentHash: hash || undefined }))
}

// with no hash given, a mint our wallet sent stands as the delivery once the chain has it
export function markDelivered(network: Network, id: string, deliveredHash: string): void {
  update(network, id, (t) => ({
    ...t,
    stage: 'delivered',
    deliveredHash: deliveredHash || t.deliveredHash || t.sentHash,
    deliveredAt: t.deliveredAt ?? Date.now(),
  }))
}

export function forgetTransfer(network: Network, id: string): void {
  write(network, listTransfers(network).filter((t) => t.id !== id))
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
    () => {
      const hit = cache.get(network)
      if (hit) return hit
      const fresh = listTransfers(network)
      cache.set(network, fresh)
      return fresh
    },
    () => EMPTY,
  )
}
