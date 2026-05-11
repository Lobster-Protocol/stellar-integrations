// Cross-chain arbitrage flow for the Arb Reserve.
// The actual trade execution on EVM happens elsewhere (existing bot).
// This module just builds and signs the bridge legs around it.

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

export interface ArbLeg {
  direction: 'OUT' | 'IN'
  txHash?: string
  status: 'pending' | 'submitted' | 'confirmed' | 'failed'
}

export interface ArbCycle {
  dispatch: ArbDispatch
  outLeg: ArbLeg
  inLeg: ArbLeg
}

export async function quoteReturnLeg(
  sdk: AllbridgeCoreSdk,
  dispatch: ArbDispatch,
  trustlineRequired: boolean,
) {
  ArbDispatchSchema.parse(dispatch)
  const req: BridgeRequest = {
    sourceChain: dispatch.targetChain,
    amount: dispatch.amount,
    fromAddress: dispatch.evmExecutionAccount,
    toAddress: dispatch.stellarReserveAccount,
  }
  return quoteBridge(sdk, req, trustlineRequired)
}

export async function buildReturnLegTx(
  sdk: AllbridgeCoreSdk,
  dispatch: ArbDispatch,
): Promise<unknown> {
  ArbDispatchSchema.parse(dispatch)
  return buildBridgeTx(sdk, {
    sourceChain: dispatch.targetChain,
    amount: dispatch.amount,
    fromAddress: dispatch.evmExecutionAccount,
    toAddress: dispatch.stellarReserveAccount,
  })
}

// Outbound is scaffolded only - throws loudly if called before the flag flips.
export async function buildOutboundLegTx(): Promise<never> {
  throw new Error(
    'Arb Reserve outbound leg not ready yet. Dispatcher still being wired in.',
  )
}
