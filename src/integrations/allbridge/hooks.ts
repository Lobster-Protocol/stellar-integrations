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

// gated on a non-empty issuer so testnet does not fire an http call
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
    queryKey: [
      NS,
      'quote',
      req?.sourceChain ?? null,
      req?.amount ?? null,
      req?.fromAddress ?? null,
      req?.toAddress ?? null,
      trustlineRequired,
    ],
    queryFn: () => quoteBridge(getAllbridgeSdk(), req!, trustlineRequired),
    enabled: !!req,
    staleTime: STALE_QUOTE,
    refetchInterval: STALE_QUOTE,
    refetchIntervalInBackground: false,
  })
}

// only broadcasts when the current allowance is below the deposit
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

// returns the source-chain hash. allbridge relays to stellar (~2 min)
export function useBridgeSend() {
  return useMutation({
    mutationFn: async (req: BridgeRequest) => {
      const sdk = getAllbridgeSdk()
      const raw = await buildBridgeTx(sdk, req)
      return sendAllbridgeEvmTx(raw, req.sourceChain)
    },
  })
}
