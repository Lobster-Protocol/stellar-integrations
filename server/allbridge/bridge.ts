import {
  ChainSymbol,
  Messenger,
  type SendParams,
  type TokenWithChainDetails,
  type TransferStatusResponse,
} from '@allbridge/bridge-core-sdk'

import { getAllbridgeSdk } from './client'
import type { RawTx } from './types'

// only the evm sources allbridge lists usdc pools for, into stellar. bsc is left
// out on purpose: its usdc is 18-decimal and our approve scaling assumes 6.
export type EvmChain = 'ETH' | 'ARB'
const USDC = 'USDC'

function toChain(c: EvmChain): ChainSymbol {
  return c === 'ETH' ? ChainSymbol.ETH : ChainSymbol.ARB
}

async function resolveUsdc(chain: ChainSymbol): Promise<TokenWithChainDetails> {
  const tokens = await getAllbridgeSdk().tokensByChain(chain)
  const usdc = tokens.find((t) => t.symbol === USDC)
  if (!usdc) throw new Error(`USDC not available on ${chain} via Allbridge Core`)
  return usdc
}

export interface BridgeQuote {
  amountIn: string
  amountOut: string
  etaSeconds: number | null
  gasFeeOptions: Record<string, string>
}

export async function quote(chain: EvmChain, amount: string): Promise<BridgeQuote> {
  const sdk = getAllbridgeSdk()
  const src = await resolveUsdc(toChain(chain))
  const dst = await resolveUsdc(ChainSymbol.SRB)
  const messenger = Messenger.ALLBRIDGE

  const amountOut = await sdk.getAmountToBeReceived(amount, src, dst)
  const gasFee = await sdk.getGasFeeOptions(src, dst, messenger)
  const etaMs = sdk.getAverageTransferTime(src, dst, messenger)

  // gas fee options come back keyed by payment method with a { float } string;
  // flatten to method -> float and drop anything without one.
  const gasFeeOptions: Record<string, string> = {}
  for (const [k, v] of Object.entries(gasFee)) {
    if (v && typeof v === 'object' && 'float' in v && typeof (v as { float: unknown }).float === 'string') {
      gasFeeOptions[k] = (v as { float: string }).float
    }
  }

  const secs = typeof etaMs === 'number' ? Math.round(etaMs / 1000) : NaN
  return {
    amountIn: amount,
    amountOut,
    etaSeconds: secs >= 10 && secs <= 86_400 ? secs : null,
    gasFeeOptions,
  }
}

// raw evm tx that bridges usdc from `chain` to a stellar address. builds only:
// the caller (a wallet or a custodial evm signer) signs and broadcasts.
export async function buildSend(
  chain: EvmChain,
  amount: string,
  fromAddress: string,
  toAddress: string,
): Promise<RawTx> {
  const src = await resolveUsdc(toChain(chain))
  const dst = await resolveUsdc(ChainSymbol.SRB)
  const params: SendParams = {
    amount,
    fromAccountAddress: fromAddress,
    toAccountAddress: toAddress,
    sourceToken: src,
    destinationToken: dst,
    messenger: Messenger.ALLBRIDGE,
  }
  return (await getAllbridgeSdk().bridge.rawTxBuilder.send(params)) as RawTx
}

// raw erc-20 approve for the bridge contract on the source chain.
export async function buildApprove(chain: EvmChain, owner: string, amount: string): Promise<RawTx> {
  const src = await resolveUsdc(toChain(chain))
  return (await getAllbridgeSdk().bridge.rawTxBuilder.approve({ token: src, owner, amount })) as RawTx
}

// the bridge contract address on `chain`, needed to read the erc-20 allowance.
export async function spender(chain: EvmChain): Promise<string> {
  return (await resolveUsdc(toChain(chain))).bridgeAddress
}

// delivery on stellar is relayer-automatic (no claim tx), but the transfer takes
// minutes; this is how a caller learns whether it landed. the source txId is the
// evm hash returned by the send.
export function transferStatus(chain: EvmChain, txId: string): Promise<TransferStatusResponse> {
  return getAllbridgeSdk().getTransferStatus(toChain(chain), txId)
}

export function listTokens(chain: EvmChain): Promise<TokenWithChainDetails[]> {
  return getAllbridgeSdk().tokensByChain(toChain(chain))
}
