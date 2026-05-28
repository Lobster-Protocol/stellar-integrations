import { useQuery } from '@tanstack/react-query'
import { Horizon, NotFoundError } from '@stellar/stellar-sdk'
import type { Network } from '../../config/contracts'
import { getHorizonServer } from './client'

type BalanceLine = Horizon.HorizonApi.BalanceLine
type BalanceLineAsset = Horizon.HorizonApi.BalanceLineAsset

export interface AccountBalance {
  code: string
  issuer?: string
  balance: string
  isNative: boolean
}

export interface AccountOperation {
  id: string
  type: string
  createdAt: string
  transactionHash: string
  successful: boolean
}

function isBalanceLineWithCode(b: BalanceLine): b is BalanceLineAsset {
  return b.asset_type === 'credit_alphanum4' || b.asset_type === 'credit_alphanum12'
}

function mapBalance(b: BalanceLine): AccountBalance | null {
  if (b.asset_type === 'native') {
    return { code: 'XLM', balance: b.balance, isNative: true }
  }
  if (isBalanceLineWithCode(b)) {
    return {
      code: b.asset_code,
      issuer: b.asset_issuer,
      balance: b.balance,
      isNative: false,
    }
  }
  // skip liquidity pool shares - we only show asset holdings
  return null
}

export async function getAccountBalances(
  network: Network,
  accountId: string,
): Promise<AccountBalance[]> {
  const server = getHorizonServer(network)
  try {
    const account = await server.loadAccount(accountId)
    return account.balances
      .map((b) => mapBalance(b))
      .filter((b): b is AccountBalance => b !== null)
  } catch (err) {
    if (err instanceof NotFoundError) return []  // account not on-chain here
    throw err
  }
}

export async function getRecentOperations(
  network: Network,
  accountId: string,
  limit = 10,
): Promise<AccountOperation[]> {
  const server = getHorizonServer(network)
  try {
    const page = await server.operations().forAccount(accountId).order('desc').limit(limit).call()
    return page.records.map((r) => ({
      id: r.id,
      type: r.type,
      createdAt: r.created_at,
      transactionHash: r.transaction_hash,
      successful: r.transaction_successful,
    }))
  } catch (err) {
    if (err instanceof NotFoundError) return []
    throw err
  }
}

// react-query wrappers live with the fetchers they wrap. Balances move
// faster than the op history, so they get a tighter stale window.
export function useAccountBalances(network: Network, accountId: string | null) {
  return useQuery({
    queryKey: ['horizon', 'balances', network, accountId],
    queryFn: () => getAccountBalances(network, accountId!),
    enabled: !!accountId,
    staleTime: 20_000,
    retry: 1,
  })
}

export function useAccountOperations(network: Network, accountId: string | null, limit = 10) {
  return useQuery({
    queryKey: ['horizon', 'operations', network, accountId, limit],
    queryFn: () => getRecentOperations(network, accountId!, limit),
    enabled: !!accountId,
    staleTime: 30_000,
    retry: 1,
  })
}
