import { useMutation } from '@tanstack/react-query'

import { confirmBrokerTrade } from './swap'
import { buildSoroswapSwapTx } from './soroswap-fallback'
import { brokerAssetToSac, toStroops } from './asset-mapping'
import { type Network } from '../../config/contracts'
import { submitSignedXdr, waitForTx } from '../lobster/factory'
import type { Signer } from '../signer/types'
import type { BrokerQuoteParams } from './types'

// 1% slippage on the soroswap leg. broker default is 2% but the direct
// router gives a tighter quote so we ask for less.
const SOROSWAP_SLIPPAGE = 0.01
// 3 minute swap deadline. avoids stale auth in slow signing flows.
const SOROSWAP_DEADLINE_SEC = 180

export function useBrokerConfirm() {
  return useMutation({
    mutationFn: async (args: {
      account: string
      networkPassphrase: string
      signer: Signer
      onHash?: (hash: string) => void
    }) => {
      await confirmBrokerTrade(args.account, args.networkPassphrase, args.signer, args.onHash)
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

export function useSoroswapConfirm() {
  return useMutation({
    mutationFn: async (args: SoroswapConfirmArgs): Promise<string> => {
      const sellingTokenId = brokerAssetToSac(args.params.sellingAsset, args.network)
      const buyingTokenId = brokerAssetToSac(args.params.buyingAsset, args.network)
      if (!sellingTokenId || !buyingTokenId) {
        throw new Error('soroswap fallback: asset to SAC mapping not available on this network')
      }
      const amountInStroops = toStroops(args.params.sellingAmount ?? '0')
      if (!amountInStroops) throw new Error('soroswap fallback: invalid amount')

      const minAmountOut = (args.buyingStroops * BigInt(Math.floor((1 - SOROSWAP_SLIPPAGE) * 10_000))) / 10_000n
      const deadlineUnix = Math.floor(Date.now() / 1000) + SOROSWAP_DEADLINE_SEC

      const xdr = await buildSoroswapSwapTx({
        network: args.network,
        callerAccount: args.account,
        sellingTokenId,
        buyingTokenId,
        amountInStroops,
        minAmountOut,
        deadlineUnix,
      })

      const { signedTxXdr } = await args.signer.signTransaction(xdr, {
        networkPassphrase: args.networkPassphrase,
        address: args.account,
      })
      const hash = await submitSignedXdr(args.network, signedTxXdr)
      const final = await waitForTx(args.network, hash)
      if (final.status !== 'SUCCESS') {
        throw new Error(`soroswap swap did not succeed: status ${final.status}`)
      }
      return hash
    },
  })
}
