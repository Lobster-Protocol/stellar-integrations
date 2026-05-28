import { useMutation, useQuery } from '@tanstack/react-query'
import type { rpc } from '@stellar/stellar-sdk'

import { getFactoryInfo, getPoolsByUser, buildPingTx, submitSignedXdr, waitForTx } from './factory'
import type { FactoryInfo, LobsterPool, Network } from './types'

export function useFactoryInfo(network: Network, callerAccount?: string) {
  // mainnet reads need a caller account; once the user connects we want a
  // refetch, so it sits in the key
  return useQuery<FactoryInfo>({
    queryKey: ['lobster', 'factory-info', network, callerAccount ?? null],
    queryFn: () => getFactoryInfo(network, callerAccount),
    enabled: network === 'testnet' || !!callerAccount,
    staleTime: 60_000,
    retry: 1,
  })
}

export function useLobsterPositions(network: Network, user: string | null) {
  return useQuery<LobsterPool[]>({
    queryKey: ['lobster', 'positions', network, user],
    queryFn: () => getPoolsByUser(network, user!),
    enabled: !!user,
    staleTime: 30_000,
    retry: 1,
  })
}

export function useBuildPingTx(network: Network) {
  return useMutation({ mutationFn: (from: string) => buildPingTx(network, from) })
}

export function useSubmitAndWait(network: Network) {
  return useMutation<{ hash: string; status: rpc.Api.GetTransactionResponse['status'] }, Error, string>({
    mutationFn: async (signedXdr) => {
      const hash = await submitSignedXdr(network, signedXdr)
      const final = await waitForTx(network, hash)
      return { hash, status: final.status }
    },
  })
}
