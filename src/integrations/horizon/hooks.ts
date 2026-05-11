import { useQuery } from '@tanstack/react-query'
import type { Network } from '../../config/contracts'
import { getAccountBalances, type AccountBalance } from './balances'
import { getRecentOperations, type AccountOperation } from './operations'

const NS = 'horizon'
const STALE_BALANCES = 20_000
const STALE_OPERATIONS = 30_000

export function useAccountBalances(network: Network, accountId: string | null) {
  return useQuery<AccountBalance[]>({
    queryKey: [NS, 'balances', network, accountId],
    queryFn: () => getAccountBalances(network, accountId!),
    enabled: !!accountId,
    staleTime: STALE_BALANCES,
    retry: 1,
  })
}

export function useAccountOperations(
  network: Network,
  accountId: string | null,
  limit = 10,
) {
  return useQuery<AccountOperation[]>({
    queryKey: [NS, 'operations', network, accountId, limit],
    queryFn: () => getRecentOperations(network, accountId!, limit),
    enabled: !!accountId,
    staleTime: STALE_OPERATIONS,
    retry: 1,
  })
}
