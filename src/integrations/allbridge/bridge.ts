import {
  type AllbridgeCoreSdk,
  ChainSymbol,
  type SendParams,
  Messenger,
  type TokenWithChainDetails,
} from '@allbridge/bridge-core-sdk'
import type { RawEvmTx } from '../evm/send'
import {
  type BridgeQuote,
  BridgeRequestSchema,
  type BridgeRequest,
  type EvmSourceChain,
  BRIDGE_USDC_SYMBOL,
} from './types'

function toChainSymbol(c: EvmSourceChain): ChainSymbol {
  switch (c) {
    case 'ETH':
      return ChainSymbol.ETH
    case 'ARB':
      return ChainSymbol.ARB
    case 'BSC':
      return ChainSymbol.BSC
  }
}

export async function resolveUsdc(
  sdk: AllbridgeCoreSdk,
  chain: ChainSymbol,
): Promise<TokenWithChainDetails> {
  const tokens = await sdk.tokensByChain(chain)
  const usdc = tokens.find((t) => t.symbol === BRIDGE_USDC_SYMBOL)
  if (!usdc) {
    throw new Error(`USDC not available on ${chain} via Allbridge Core.`)
  }
  return usdc
}

export async function quoteBridge(
  sdk: AllbridgeCoreSdk,
  req: BridgeRequest,
  trustlineRequired: boolean,
): Promise<BridgeQuote> {
  BridgeRequestSchema.parse(req)

  const sourceChain = toChainSymbol(req.sourceChain)
  const sourceUsdc = await resolveUsdc(sdk, sourceChain)
  const stellarUsdc = await resolveUsdc(sdk, ChainSymbol.SRB)

  // CCTP isn't deployed on Stellar yet, so we use ALLBRIDGE messenger.
  // Native Circle USDC still arrives on Stellar (issued by the canonical
  // G-address), so the trustline check stays correct.
  const messenger = Messenger.ALLBRIDGE
  const amountOutFloat = await sdk.getAmountToBeReceived(
    req.amount,
    sourceUsdc,
    stellarUsdc,
  )
  const gasFee = await sdk.getGasFeeOptions(sourceUsdc, stellarUsdc, messenger)

  // Allbridge advertises ~2 min for USDC -> Stellar. Soft estimate, real
  // durations vary with EVM congestion.
  const estimatedTimeSeconds = 120

  // Some gas fee entries come back without a .float string. Drop them
  // rather than coerce to "[object Object]".
  const narrowedGasFee: Record<string, string> = {}
  for (const [k, v] of Object.entries(gasFee)) {
    if (v && typeof v === 'object' && 'float' in v && typeof (v as { float: unknown }).float === 'string') {
      narrowedGasFee[k] = (v as { float: string }).float
    } else if (typeof v === 'string') {
      narrowedGasFee[k] = v
    }
  }

  return {
    amountInFloat: req.amount,
    amountOutFloat,
    estimatedTimeSeconds,
    trustlineRequired,
    gasFeeOptions: narrowedGasFee,
  }
}

// Returns a raw EVM tx (to/data/value/from) the wallet client can sign.
// Stellar is always the destination here.
export async function buildBridgeTx(
  sdk: AllbridgeCoreSdk,
  req: BridgeRequest,
): Promise<RawEvmTx> {
  BridgeRequestSchema.parse(req)

  const sourceChain = toChainSymbol(req.sourceChain)
  const sourceUsdc = await resolveUsdc(sdk, sourceChain)
  const stellarUsdc = await resolveUsdc(sdk, ChainSymbol.SRB)

  const params: SendParams = {
    amount: req.amount,
    fromAccountAddress: req.fromAddress,
    toAccountAddress: req.toAddress,
    sourceToken: sourceUsdc,
    destinationToken: stellarUsdc,
    messenger: Messenger.ALLBRIDGE,
  }

  return (await sdk.bridge.rawTxBuilder.send(params)) as RawEvmTx
}

/**
 * Build the USDC `approve` raw tx the EVM wallet will sign before the
 * bridge call. Allbridge needs allowance on the bridge contract for the
 * source chain.
 */
export async function buildBridgeApproveTx(
  sdk: AllbridgeCoreSdk,
  ownerAddress: string,
  chain: EvmSourceChain,
  amount: string,
): Promise<RawEvmTx> {
  const sourceUsdc = await resolveUsdc(sdk, toChainSymbol(chain))
  return (await sdk.bridge.rawTxBuilder.approve({
    token: sourceUsdc,
    owner: ownerAddress,
    amount,
  })) as RawEvmTx
}

/**
 * Address of the Allbridge bridge contract on a given EVM chain. We need
 * it to read the ERC-20 allowance and decide whether the approve step is
 * required at all. The SDK surfaces it on the token's chain details.
 */
export async function getBridgeSpender(
  sdk: AllbridgeCoreSdk,
  chain: EvmSourceChain,
): Promise<string> {
  const sourceUsdc = await resolveUsdc(sdk, toChainSymbol(chain))
  return sourceUsdc.bridgeAddress
}
