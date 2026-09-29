import { useQuery } from '@tanstack/react-query'

import type { Network } from '../lobster/types'
import { readAccountSigning } from './multisig'

export function useAccountSigning(network: Network, accountId: string | null) {
  return useQuery({
    queryKey: ['stellar', 'signing', network, accountId],
    queryFn: () => readAccountSigning(network, accountId!),
    enabled: !!accountId,
    staleTime: 30_000,
    retry: 1,
  })
}
