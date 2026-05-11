import { useMutation, useQuery, type UseQueryOptions } from '@tanstack/react-query'
import type { TokenWithChainDetails } from '@allbridge/bridge-core-sdk'

import { getAllbridgeSdk } from './client'
import { hasTrustline, buildTrustlineXdr, submitSignedXdr } from './trustline'
import { resolveUsdc, quoteBridge, buildBridgeTx } from './bridge'
import type { BridgeRequest, BridgeQuote } from './types'
import { ChainSymbol } from '@allbridge/bridge-core-sdk'

const NS = 'allbridge'
const STALE_TOKEN = 5 * 60_000
const STALE_QUOTE = 30_000
const STALE_TRUSTLINE = 60_000

export function useAllbridgeUsdc(chain: ChainSymbol, opts?: Partial<UseQueryOptions<TokenWithChainDetails>>) {
  return useQuery<TokenWithChainDetails>({
    queryKey: [NS, 'usdc', chain],
    queryFn: () => resolveUsdc(getAllbridgeSdk(), chain),
    staleTime: STALE_TOKEN,
    ...opts,
  })
}

// Gated on a non-empty issuer so testnet (no Allbridge USDC issuer)
// doesn't fire an HTTP request.
export function useTrustline(
  accountId: string | null,
  assetCode: string,
  assetIssuer: string,
  network: 'testnet' | 'mainnet',
) {
  return useQuery<boolean>({
    queryKey: [NS, 'trustline', accountId, assetCode, assetIssuer, network],
    queryFn: () => hasTrustline(accountId!, assetCode, assetIssuer, network),
    enabled: !!accountId && !!assetIssuer,
    staleTime: STALE_TRUSTLINE,
  })
}

export function useBridgeQuote(req: BridgeRequest | null, trustlineRequired: boolean) {
  return useQuery<BridgeQuote>({
    queryKey: [NS, 'quote', req, trustlineRequired],
    queryFn: () => quoteBridge(getAllbridgeSdk(), req!, trustlineRequired),
    enabled: !!req,
    staleTime: STALE_QUOTE,
    refetchInterval: STALE_QUOTE,
  })
}

export function useBuildBridgeTx() {
  return useMutation({
    mutationFn: (req: BridgeRequest) => buildBridgeTx(getAllbridgeSdk(), req),
  })
}

export function useBuildTrustline(network: 'testnet' | 'mainnet') {
  return useMutation({
    mutationFn: ({
      accountId,
      assetCode,
      assetIssuer,
    }: {
      accountId: string
      assetCode: string
      assetIssuer: string
    }) => buildTrustlineXdr(accountId, assetCode, assetIssuer, network),
  })
}

export function useSubmitSignedXdr(network: 'testnet' | 'mainnet') {
  return useMutation({
    mutationFn: (signedXdr: string) => submitSignedXdr(signedXdr, network),
  })
}
