// arb reserve bridge legs. trade execution sits in the evm bot.

import { type AllbridgeCoreSdk } from '@allbridge/bridge-core-sdk'
import { z } from 'zod'

import { type BridgeRequest, EvmSourceChain, stellarAccountIdRegex, positiveAmountRegex } from './types'
import { buildBridgeTx, quoteBridge } from './bridge'

export const ArbDispatchSchema = z.object({
  stellarReserveAccount: z.string().regex(stellarAccountIdRegex),
  evmExecutionAccount: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount: z.string().regex(positiveAmountRegex),
  targetChain: EvmSourceChain,
  rationale: z.string().min(1).max(280),
})
export type ArbDispatch = z.infer<typeof ArbDispatchSchema>

export type ArbLegDirection = 'OUT' | 'IN'

export type ArbLeg =
  | { direction: ArbLegDirection; status: 'pending' }
  | { direction: ArbLegDirection; status: 'submitted'; txHash: string }
  | { direction: ArbLegDirection; status: 'confirmed'; txHash: string }
  | { direction: ArbLegDirection; status: 'failed'; reason?: string }

export interface ArbCycle {
  dispatch: ArbDispatch
  outLeg: ArbLeg
  inLeg: ArbLeg
}

// shared by quoteReturnLeg + buildReturnLegTx
function dispatchToReturnRequest(dispatch: ArbDispatch): BridgeRequest {
  return {
    sourceChain: dispatch.targetChain,
    amount: dispatch.amount,
    fromAddress: dispatch.evmExecutionAccount,
    toAddress: dispatch.stellarReserveAccount,
  }
}

export async function quoteReturnLeg(
  sdk: AllbridgeCoreSdk,
  dispatch: ArbDispatch,
  trustlineRequired: boolean,
) {
  ArbDispatchSchema.parse(dispatch)
  return quoteBridge(sdk, dispatchToReturnRequest(dispatch), trustlineRequired)
}

export async function buildReturnLegTx(
  sdk: AllbridgeCoreSdk,
  dispatch: ArbDispatch,
): Promise<unknown> {
  ArbDispatchSchema.parse(dispatch)
  return buildBridgeTx(sdk, dispatchToReturnRequest(dispatch))
}

// outbound leg: dispatcher not yet hooked up
export async function buildOutboundLegTx(): Promise<never> {
  throw new Error('arb reserve outbound leg not ready')
}
