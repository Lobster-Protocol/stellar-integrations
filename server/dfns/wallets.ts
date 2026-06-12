import { getDfnsClient } from './client'
import type { DfnsStellarNetwork } from './types'

export interface WalletSummary {
  id: string
  address: string
  name: string
  network: string
}

function toSummary(w: { id: string; address?: string; name?: string; network?: string }): WalletSummary {
  return {
    id: w.id,
    address: w.address ?? '',
    name: w.name ?? '',
    network: w.network ?? '',
  }
}

export async function createStellarWallet(
  name: string,
  network: DfnsStellarNetwork,
): Promise<WalletSummary> {
  const dfns = getDfnsClient()
  const w = await dfns.wallets.createWallet({ body: { network, name } })
  return toSummary(w)
}

export async function listWallets(): Promise<WalletSummary[]> {
  const dfns = getDfnsClient()
  const res = await dfns.wallets.listWallets({ query: { limit: 100 } })
  return (res.items ?? []).map(toSummary)
}
