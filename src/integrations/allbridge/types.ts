// ui-side types for allbridge. the sdk handles the wire format.

import { z } from 'zod'
import { StrKey } from '@stellar/stellar-sdk'

export const EvmSourceChain = z.enum(['ETH', 'ARB', 'BSC'])
export type EvmSourceChain = z.infer<typeof EvmSourceChain>

// allbridge keys tokens by symbol; usdc is the only one we bridge
export const BRIDGE_USDC_SYMBOL = 'USDC'

// stellar G-address: Ed25519 public key, base32, 56 chars
export const stellarAccountIdRegex = /^G[A-Z2-7]{55}$/

// positive usdc decimal string. rejects zero, leading zeros, >6 decimals, sci notation, signs
export const positiveAmountRegex = /^(?!0+(\.0+)?$)(0|[1-9]\d{0,17})(\.\d{1,6})?$/

export const BridgeRequestSchema = z
  .object({
    sourceChain: EvmSourceChain,
    amount: z.string().regex(positiveAmountRegex, 'amount must be a positive USDC value'),
    fromAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'invalid EVM address'),
    toAddress: z.string().regex(stellarAccountIdRegex, 'invalid Stellar account id'),
  })
  // also enforce the Ed25519 checksum so a corrupted G-address can't strand funds
  .superRefine((val, ctx) => {
    if (!StrKey.isValidEd25519PublicKey(val.toAddress)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['toAddress'],
        message: 'Stellar account id fails checksum',
      })
    }
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
  // filled after allbridge relays to soroban
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
