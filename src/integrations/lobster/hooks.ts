import { useMutation, useQuery } from '@tanstack/react-query'
import type { rpc } from '@stellar/stellar-sdk'

import { getFactoryInfo, getLatestVaults, getPoolsByUser, buildPingTx, submitSignedXdr, waitForTx } from './factory'
import type { FactoryInfo, LobsterPool, Network } from './types'

// both networks carry a read source, so the factory reads without any wallet
export function useFactoryInfo(network: Network) {
  return useQuery<FactoryInfo>({
    queryKey: ['lobster', 'factory-info', network],
    queryFn: () => getFactoryInfo(network),
    staleTime: 60_000,
    retry: 1,
  })
}

export function useLatestVaults(network: Network, poolCount: number | undefined, limit = 10) {
  return useQuery<LobsterPool[]>({
    queryKey: ['lobster', 'latest-vaults', network, poolCount, limit],
    queryFn: () => getLatestVaults(network, poolCount!, limit),
    enabled: !!poolCount,
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
