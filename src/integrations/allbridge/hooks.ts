import type { Address } from 'viem'
import { useMutation, useQuery } from '@tanstack/react-query'

import { hasTrustline } from './trustline'
import {
  quoteBridge,
  buildBridgeTx,
  buildBridgeApproveTx,
  getBridgeSpender,
} from './bridge'
import { getAllbridgeSdk } from './client'
import type { BridgeRequest, BridgeQuote, EvmSourceChain } from './types'
import {
  readAllowance,
  sendAllbridgeEvmTx,
  toUsdcBaseUnits,
} from '../evm/send'

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

/**
 * Approve enough USDC for the bridge contract on the source chain, but
 * only if the existing allowance is too small. Returns the tx hash when
 * we actually broadcast, or `null` when allowance was already sufficient.
 */
export function useBridgeApprove() {
  return useMutation({
    mutationFn: async (req: {
      owner: Address
      chain: EvmSourceChain
      tokenAddress: Address
      amount: string
    }): Promise<{ hash: `0x${string}`; skipped: false } | { skipped: true }> => {
      const sdk = getAllbridgeSdk()
      const spender = (await getBridgeSpender(sdk, req.chain)) as Address
      const needed = toUsdcBaseUnits(req.amount)
      const current = await readAllowance(req.tokenAddress, req.owner, spender, req.chain)
      if (current >= needed) return { skipped: true }
      const raw = await buildBridgeApproveTx(sdk, req.owner, req.chain, req.amount)
      const result = await sendAllbridgeEvmTx(raw, req.chain)
      return { hash: result.hash, skipped: false }
    },
  })
}

/**
 * Build the bridge tx then sign+send it through the connected EVM wallet.
 * Returns the source-chain tx hash once it's mined. The Stellar leg is
 * handled by the Allbridge relayer (~2 min, observable via the explorer
 * link the UI can build from the returned hash).
 */
export function useBridgeSend() {
  return useMutation({
    mutationFn: async (req: BridgeRequest) => {
      const sdk = getAllbridgeSdk()
      const raw = await buildBridgeTx(sdk, req)
      return sendAllbridgeEvmTx(raw, req.sourceChain)
    },
  })
}
