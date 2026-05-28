import { useMutation, useQuery } from '@tanstack/react-query'

import { hasTrustline } from './trustline'
import { quoteBridge, buildBridgeTx } from './bridge'
import { getAllbridgeSdk } from './client'
import type { BridgeRequest, BridgeQuote } from './types'

const NS = 'allbridge'
const STALE_QUOTE = 30_000
const STALE_TRUSTLINE = 60_000

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
