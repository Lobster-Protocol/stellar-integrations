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

  // allbridge parks a pool by cranking its feeShare toward 1 (a live pool sits
  // near 0.003). the stellar usdc pool is closed like this today, which makes the
  // fee math underflow the received amount to zero. show a clear corridor-down
  // message instead of the sdk's "amount must be greater than zero".
  const destFee = Number((stellarUsdc as { feeShare?: number | string }).feeShare)
  if (!Number.isFinite(destFee) || destFee >= 0.5) {
    throw new Error(
      'The Allbridge USDC pool into Stellar is closed right now. Bridging will work again once the pool reopens.',
    )
  }

  // no cctp on stellar yet; allbridge messenger still delivers native usdc
  const messenger = Messenger.ALLBRIDGE
  // the token list ships an empty poolInfo, so the plain getAmountToBeReceived
  // underflows to zero. read the live pool state from chain.
  const amountOutFloat = await sdk.getAmountToBeReceivedFromChain(
    req.amount,
    sourceUsdc,
    stellarUsdc,
    messenger,
  )
  const gasFee = await sdk.getGasFeeOptions(sourceUsdc, stellarUsdc, messenger)

  // average source->stellar time the SDK publishes for this messenger, in ms.
  // some corridors omit it, so keep null rather than inventing a figure. the
  // /1000 also fails safe: a value already in seconds rounds below the floor.
  const rawMs = sourceUsdc.transferTime?.[ChainSymbol.SRB]?.[messenger]
  const secs = typeof rawMs === 'number' ? Math.round(rawMs / 1000) : NaN
  const estimatedTimeSeconds = secs >= 10 && secs <= 86_400 ? secs : null

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
