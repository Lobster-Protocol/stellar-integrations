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

// Each leg of a cycle: txHash exists only once a wallet broadcast the tx,
// reason exists only on a failure. The discriminated `status` lets the UI
// render without sentinel checks on optional fields.
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

// The return leg always brings USDC back from the EVM exec account to the
// Stellar reserve. quote + build share the same reshape; factor it out.
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

// Outbound is scaffolded only - throws loudly if called before the flag flips.
export async function buildOutboundLegTx(): Promise<never> {
  throw new Error(
    'Arb Reserve outbound leg not ready yet. Dispatcher still being wired in.',
  )
}
