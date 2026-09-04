import type { Address } from 'viem'
import { useMutation, useQuery } from '@tanstack/react-query'

import { hasTrustline } from './trustline'
import { useAccountExists, isAccountMissing } from '../horizon/account'
import { getHorizonServer } from '../horizon/client'
import {
  quoteBridge,
  buildBridgeTx,
  buildBridgeApproveTx,
  getBridgeSpender,
} from './bridge'
import { getAllbridgeSdk } from './client'
import type { BridgeRequest, BridgeQuote, EvmSourceChain } from './types'
import type { Network } from '../../config/contracts'
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
  network: Network,
) {
  // gate on the account existing so a brand-new mainnet wallet does not fire a
  // loadAccount that only 404s; balances is the shared existence probe.
  const exists = useAccountExists(network, accountId) === 'live'
  return useQuery<boolean>({
    queryKey: [NS, 'trustline', accountId, assetCode, assetIssuer, network],
    queryFn: () => hasTrustline(accountId!, assetCode, assetIssuer, network),
    enabled: !!accountId && !!assetIssuer && exists,
    staleTime: STALE_TRUSTLINE,
    retry: 1,
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
    retry: 1,
  })
}

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
      // bridged USDC lands as a payment, and Stellar bounces a payment to an
      // account that is not created yet, so refuse before anything is spent on
      // the source chain rather than let the funds leave and never arrive.
      try {
        await getHorizonServer('mainnet').loadAccount(req.toAddress)
      } catch (err) {
        if (isAccountMissing(err)) {
          throw new Error(
            'The destination Stellar account is not created on-chain yet. Fund it and add the USDC trustline first, otherwise the bridged USDC cannot land.',
          )
        }
        throw err
      }
      const raw = await buildBridgeTx(sdk, req)
      return sendAllbridgeEvmTx(raw, req.sourceChain)
    },
  })
}
