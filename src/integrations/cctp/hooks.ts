import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'

import { fetchAttestation, fetchFees, type IrisAttestation } from './iris'
import { readAllowance, readGasBalance, readUsdcBalance } from './evm-burn'
import type { CctpSourceChain, Network } from '../../config/contracts'

const NS = 'cctp'

export function useCctpFees(network: Network, chain: CctpSourceChain | null) {
  return useQuery({
    queryKey: [NS, 'fees', network, chain?.domain ?? null],
    queryFn: () => fetchFees(network, chain!.domain),
    enabled: !!chain,
  })
}

export function useSourceBalances(chain: CctpSourceChain | null, owner: Address | undefined) {
  return useQuery({
    queryKey: [NS, 'balances', chain?.chainId ?? null, owner ?? null],
    queryFn: async () => {
      const [usdc, gas, allowance] = await Promise.all([
        readUsdcBalance(chain!, owner!),
        readGasBalance(chain!, owner!),
        readAllowance(chain!, owner!),
      ])
      return { usdc, gas, allowance }
    },
    enabled: !!chain && !!owner,
    staleTime: 15_000,
  })
}

// stops once Circle has signed
export function useAttestation(network: Network, sourceDomain: number | null, burnHash: string | null) {
  return useQuery<IrisAttestation>({
    queryKey: [NS, 'attestation', network, sourceDomain, burnHash],
    queryFn: () => fetchAttestation(network, sourceDomain!, burnHash!),
    enabled: sourceDomain !== null && !!burnHash,
    refetchInterval: (q) => (q.state.data?.state === 'complete' ? false : 5_000),
    // an attestation, once complete, never changes
    staleTime: Infinity,
    retry: 3,
  })
}
