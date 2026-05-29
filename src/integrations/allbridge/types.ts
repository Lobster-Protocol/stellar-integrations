// Lobster-side types for the Allbridge integration. The SDK is the source
// of truth for the wire format; these are the shapes the UI sees.

import { z } from 'zod'

export const EvmSourceChain = z.enum(['ETH', 'ARB', 'BSC'])
export type EvmSourceChain = z.infer<typeof EvmSourceChain>

// Allbridge SDK returns tokens keyed by their symbol. USDC is the only one
// we bridge in this app, so the constant lives here next to the chain types.
export const BRIDGE_USDC_SYMBOL = 'USDC'

// Stellar G-address (Ed25519 public key, base32, 56 chars).
export const stellarAccountIdRegex = /^G[A-Z2-7]{55}$/

// Positive USDC amount as a decimal string. Rejects zero, leading
// zeros, more than 6 decimals, scientific notation, signs.
export const positiveAmountRegex = /^(?!0+(\.0+)?$)(0|[1-9]\d{0,17})(\.\d{1,6})?$/

export const BridgeRequestSchema = z.object({
  sourceChain: EvmSourceChain,
  amount: z.string().regex(positiveAmountRegex, 'amount must be a positive USDC value'),
  fromAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'invalid EVM address'),
  toAddress: z.string().regex(stellarAccountIdRegex, 'invalid Stellar account id'),
})
export type BridgeRequest = z.infer<typeof BridgeRequestSchema>

export interface BridgeQuote {
  amountInFloat: string
  amountOutFloat: string
  estimatedTimeSeconds: number
  trustlineRequired: boolean
  // payment method ('native', 'stablecoin', 'abr') -> float amount
  gasFeeOptions: Record<string, string>
}

export interface BridgeSubmissionResult {
  status: 'submitted' | 'failed'
  sourceTxHash?: string
  // populated separately once Allbridge relays the message and Soroban lands
  stellarTxHash?: string
  error?: string
}

export type BridgeStatus =
  | 'idle'
  | 'checking-trustline'
  | 'creating-trustline'
  | 'awaiting-trustline-sign'
  | 'building-tx'
  | 'awaiting-source-sign'
  | 'submitted'
  | 'confirmed'
  | 'failed'

export interface BridgeEvent {
  status: BridgeStatus
  message: string
  txHash?: string
}
