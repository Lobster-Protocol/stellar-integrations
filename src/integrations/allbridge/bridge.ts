import {
  type AllbridgeCoreSdk,
  ChainSymbol,
  type SendParams,
  Messenger,
  type TokenWithChainDetails,
} from '@allbridge/bridge-core-sdk'
import {
  type BridgeQuote,
  BridgeRequestSchema,
  type BridgeRequest,
  type EvmSourceChain,
} from './types'

const USDC_SYMBOL = 'USDC'

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
  const usdc = tokens.find((t) => t.symbol === USDC_SYMBOL)
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

// Returns a viem-compatible TransactionRequest on EVM sources. Stellar
// is always the destination here.
export async function buildBridgeTx(
  sdk: AllbridgeCoreSdk,
  req: BridgeRequest,
): Promise<unknown> {
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

  return sdk.bridge.rawTxBuilder.send(params)
}
