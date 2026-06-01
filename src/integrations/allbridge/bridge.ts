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

  // no cctp on stellar yet; allbridge messenger still delivers native usdc
  const messenger = Messenger.ALLBRIDGE
  const amountOutFloat = await sdk.getAmountToBeReceived(
    req.amount,
    sourceUsdc,
    stellarUsdc,
  )
  const gasFee = await sdk.getGasFeeOptions(sourceUsdc, stellarUsdc, messenger)

  // ~2 min per allbridge, varies with evm congestion
  const estimatedTimeSeconds = 120

  // skip entries without a .float string instead of stringifying objects
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

// raw evm tx for the wallet to sign. stellar is always the destination.
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

// usdc approve raw tx for the bridge contract on the source chain
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

// allbridge contract address on `chain`. needed to read the erc-20 allowance.
export async function getBridgeSpender(
  sdk: AllbridgeCoreSdk,
  chain: EvmSourceChain,
): Promise<string> {
  const sourceUsdc = await resolveUsdc(sdk, toChainSymbol(chain))
  return sourceUsdc.bridgeAddress
}
