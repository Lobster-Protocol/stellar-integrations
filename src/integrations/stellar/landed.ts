import type { Query, QueryClient } from '@tanstack/react-query'

import type { Network } from '../../config/contracts'
import { getHorizonServer } from '../horizon/client'

// Every confirmed transaction reports here, and one listener set up next to the query
// client refreshes whatever reads balances, so no screen has to remember to.
type Listener = (network: Network, hash: string) => void
const listeners = new Set<Listener>()

export function txLanded(network: Network, hash: string): void {
  for (const listener of listeners) listener(network, hash)
}

export function onTxLanded(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// queries, by the first part of their key, that hold something a transaction can change
const BALANCE_ROOTS = new Set([
  'horizon',
  'activity',
  'balance-history',
  'lobster',
  'trustline',
  'cctp',
  'vault-wallet-held',
  'swap-sac-balance',
])
// read straight from the rpc that just confirmed the transaction, so already current
const RPC_ROOTS = new Set(['vault-wallet-held', 'swap-sac-balance'])

// Horizon serves a ledger a few seconds after it closes, and a refetch before that would
// cache the old balance for the next 20 s
export async function horizonHasTx(network: Network, hash: string, waitMs = 20_000, everyMs = 1_000): Promise<boolean> {
  const server = getHorizonServer(network)
  const deadline = Date.now() + waitMs
  while (Date.now() < deadline) {
    try {
      await server.transactions().transaction(hash).call()
      return true
    } catch {
      // not ingested yet, or a read that failed: try again until the deadline
    }
    await new Promise((r) => setTimeout(r, everyMs))
  }
  return false
}

export function refreshBalancesOnLanded(qc: QueryClient, hasTx = horizonHasTx): () => void {
  return onTxLanded((network, hash) => {
    const on = (roots: Set<string>) => ({
      predicate: (q: Query) => roots.has(String(q.queryKey[0])) && q.queryKey.includes(network),
    })
    void qc.invalidateQueries(on(RPC_ROOTS))
    // refreshed even when Horizon never shows it in time, since the rpc has already moved on
    void hasTx(network, hash).then(() => qc.invalidateQueries(on(BALANCE_ROOTS)))
  })
}
