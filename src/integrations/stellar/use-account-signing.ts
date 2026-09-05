import { useQuery } from '@tanstack/react-query'

import type { Network } from '../lobster/types'
import { readAccountSigning, isMultisig } from './multisig'

// reads the connected account's signers and thresholds from Horizon. a value
// action gates on this: when the account is multisig the vault modal collects a
// quorum of signatures instead of one.
export function useAccountSigning(network: Network, accountId: string | null) {
  return useQuery({
    queryKey: ['stellar', 'signing', network, accountId],
    queryFn: () => readAccountSigning(network, accountId!),
    enabled: !!accountId,
    staleTime: 30_000,
    retry: 1,
  })
}

export function useIsMultisig(network: Network, accountId: string | null): boolean {
  const q = useAccountSigning(network, accountId)
  return q.data ? isMultisig(q.data) : false
}
