import { useMutation } from '@tanstack/react-query'

import { confirmBrokerTrade } from './swap'
import { buildSoroswapSwapTx } from './soroswap-fallback'
import { brokerAssetToSac, toStroops } from './asset-mapping'
import { type Network } from '../../config/contracts'
import { submitSignedXdr, waitForTx } from '../lobster/factory'
import type { Signer } from '../signer/types'
import type { BrokerQuoteParams } from './types'

// the direct router quotes tighter than the broker's 2% default, so ask for less.
// exported so the swap panel shows the figure actually enforced.
export const SOROSWAP_SLIPPAGE = 0.01
// 3 minute swap deadline. avoids stale auth in slow signing flows.
const SOROSWAP_DEADLINE_SEC = 180

export function useBrokerConfirm() {
  return useMutation({
    mutationFn: async (args: {
      account: string
      networkPassphrase: string
      params: BrokerQuoteParams
      signer: Signer
      onHash?: (hash: string) => void
      // the quote's selling amount, in stroops. caps what the broker xdr can
      // spend so a leg can't push more than the trader agreed to.
      maxSpendStroops?: bigint
    }) => {
      await confirmBrokerTrade(
        args.account,
        args.networkPassphrase,
        args.signer,
        args.params,
        args.onHash,
        args.maxSpendStroops,
      )
    },
  })
}

export interface SoroswapConfirmArgs {
  account: string
  network: Network
  networkPassphrase: string
  params: BrokerQuoteParams
  buyingStroops: bigint
  signer: Signer
}

// kept apart from the mutation so a multisig owner can gather a quorum on one
// frozen envelope. windowSecs widens both the tx timebound and the in-contract
// deadline; below the frozen minAmountOut the swap is declined on-chain.
export async function buildSoroswapConfirmTx(
  args: SoroswapConfirmArgs,
  windowSecs = SOROSWAP_DEADLINE_SEC,
): Promise<string> {
  const sellingTokenId = brokerAssetToSac(args.params.sellingAsset, args.network)
  const buyingTokenId = brokerAssetToSac(args.params.buyingAsset, args.network)
  if (!sellingTokenId || !buyingTokenId) {
    throw new Error('soroswap fallback: asset to SAC mapping not available on this network')
  }
  const amountInStroops = toStroops(args.params.sellingAmount ?? '0')
  if (!amountInStroops) throw new Error('soroswap fallback: invalid amount')

  const minAmountOut = (args.buyingStroops * BigInt(Math.floor((1 - SOROSWAP_SLIPPAGE) * 10_000))) / 10_000n
  const deadlineUnix = Math.floor(Date.now() / 1000) + windowSecs

  return buildSoroswapSwapTx({
    network: args.network,
    callerAccount: args.account,
    sellingTokenId,
    buyingTokenId,
    amountInStroops,
    minAmountOut,
    deadlineUnix,
    timeoutSecs: windowSecs,
  })
}

export function useSoroswapConfirm() {
  return useMutation({
    mutationFn: async (args: SoroswapConfirmArgs): Promise<string> => {
      const xdr = await buildSoroswapConfirmTx(args)
      const { signedTxXdr } = await args.signer.signTransaction(xdr, {
        networkPassphrase: args.networkPassphrase,
        address: args.account,
      })
      // a soroban swap always comes back as a signed envelope to submit.
      if (!signedTxXdr) throw new Error('swap signer did not return a signed transaction')
      const hash = await submitSignedXdr(args.network, signedTxXdr)
      const final = await waitForTx(args.network, hash)
      if (final.status !== 'SUCCESS') {
        throw new Error(`soroswap swap did not succeed: status ${final.status}`)
      }
      return hash
    },
  })
}
