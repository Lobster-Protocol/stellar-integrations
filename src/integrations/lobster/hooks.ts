import { useMutation, useQuery } from '@tanstack/react-query'
import type { rpc } from '@stellar/stellar-sdk'

import { getFactoryInfo, getPoolsByUser, buildPingTx, submitSignedXdr, waitForTx } from './factory'
import type { FactoryInfo, LobsterPool, Network } from './types'

const NS = 'lobster'
const STALE_FACTORY_INFO = 60_000
const STALE_POSITIONS = 30_000

export function useFactoryInfo(network: Network, callerAccount?: string) {
  // include callerAccount in the key: mainnet reads need one, and once
  // the user connects we want a refetch
  return useQuery<FactoryInfo>({
    queryKey: [NS, 'factory-info', network, callerAccount ?? null],
    queryFn: () => getFactoryInfo(network, callerAccount),
    enabled: network === 'testnet' || !!callerAccount,
    staleTime: STALE_FACTORY_INFO,
    retry: 1,
  })
}

export function useLobsterPositions(network: Network, user: string | null) {
  return useQuery<LobsterPool[]>({
    queryKey: [NS, 'positions', network, user],
    queryFn: () => getPoolsByUser(network, user!),
    enabled: !!user,
    staleTime: STALE_POSITIONS,
    retry: 1,
  })
}

export function useBuildPingTx(network: Network) {
  return useMutation({
    mutationFn: (from: string) => buildPingTx(network, from),
  })
}

export function useSubmitAndWait(network: Network) {
  return useMutation<
    { hash: string; status: rpc.Api.GetTransactionResponse['status'] },
    Error,
    string
  >({
    mutationFn: async (signedXdr) => {
      const hash = await submitSignedXdr(network, signedXdr)
      const final = await waitForTx(network, hash)
      return { hash, status: final.status }
    },
  })
}
