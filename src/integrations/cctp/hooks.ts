import { useQuery } from '@tanstack/react-query'
import type { Address } from 'viem'

import { fetchAttestation, fetchFees, fetchForwardQuote, type IrisAttestation } from './iris'
import { isReceivedOnEvm, readAllowance, readGasBalance, readUsdcBalance } from './evm-burn'
import { readStellarAllowance } from './stellar-burn'
import { circleMinted } from './status'
import { STELLAR_CCTP_DOMAIN, type CctpSourceChain, type Network } from '../../config/contracts'

const NS = 'cctp'

export function useCctpFees(network: Network, chain: CctpSourceChain | null) {
  return useQuery({
    queryKey: [NS, 'fees', network, chain?.domain ?? null],
    queryFn: () => fetchFees(network, chain!.domain),
    enabled: !!chain,
  })
}

// what Circle charges to mint a Stellar burn on `chain` for you
export function useForwardQuote(network: Network, chain: CctpSourceChain | null) {
  return useQuery({
    queryKey: [NS, 'forward-quote', network, chain?.domain ?? null],
    queryFn: () => fetchForwardQuote(network, chain!.domain),
    enabled: !!chain,
    // the quote follows gas on the destination chain
    staleTime: 30_000,
    refetchInterval: 60_000,
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

// USDC and gas of one wallet on every chain the bridge reaches, for the wallets panel.
// A chain that fails to answer reads as unknown rather than zero
export function useEvmHoldings(chains: CctpSourceChain[], owner: Address | undefined) {
  return useQuery({
    queryKey: [NS, 'holdings', chains.map((c) => c.chainId).join(','), owner ?? null],
    queryFn: () =>
      Promise.all(
        chains.map(async (c) => {
          const [usdc, gas] = await Promise.all([
            readUsdcBalance(c, owner!).catch(() => null),
            readGasBalance(c, owner!).catch(() => null),
          ])
          return { key: c.key, usdc, gas }
        }),
      ),
    enabled: !!owner && chains.length > 0,
    staleTime: 20_000,
  })
}

export function useStellarAllowance(network: Network, owner: string | null) {
  return useQuery({
    queryKey: [NS, 'stellar-allowance', network, owner],
    queryFn: () => readStellarAllowance(network, owner!),
    enabled: !!owner,
    staleTime: 10_000,
    retry: 1,
  })
}

// Circle's view of a burn. On the way out with forwarding it keeps looking until
// Circle has minted on the EVM chain, not just until it has signed
export function useAttestation(
  network: Network,
  sourceDomain: number | null,
  burnHash: string | null,
  opts: { destinationDomain?: number; untilForwarded?: boolean } = {},
) {
  const destinationDomain = opts.destinationDomain ?? STELLAR_CCTP_DOMAIN
  const settled = (d: IrisAttestation | undefined) =>
    d?.state === 'complete' && (!opts.untilForwarded || circleMinted(d.forwardState) || d.forwardState === 'FAILED')
  return useQuery<IrisAttestation>({
    queryKey: [NS, 'attestation', network, sourceDomain, burnHash, destinationDomain],
    queryFn: () => fetchAttestation(network, sourceDomain!, burnHash!, 10_000, destinationDomain),
    enabled: sourceDomain !== null && !!burnHash,
    refetchInterval: (q) => (settled(q.state.data) ? false : 5_000),
    // an attestation, once complete, never changes; a forward settles once
    staleTime: (q) => (settled(q.state.data) ? Infinity : 0),
    retry: 3,
  })
}

// the destination chain's own word on whether a message was received, by anyone: Circle's
// mint, another tab, a custody platform. Asked until it says yes
export function useReceivedOnEvm(chain: CctpSourceChain | null, nonce: `0x${string}` | null) {
  return useQuery({
    queryKey: [NS, 'received', chain?.chainId ?? null, nonce],
    queryFn: () => isReceivedOnEvm(chain!, nonce!),
    enabled: !!chain && !!nonce,
    refetchInterval: (q) => (q.state.data ? false : 6_000),
    staleTime: (q) => (q.state.data ? Infinity : 0),
    retry: 2,
  })
}
