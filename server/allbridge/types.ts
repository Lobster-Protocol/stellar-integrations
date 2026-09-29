import { z } from 'zod'
import type { RawTransaction } from '@allbridge/bridge-core-sdk'

export type RawTx = RawTransaction

// only eth and arb: bsc usdc is 18-decimal and the approve scaling assumes 6.
const EVM_SOURCE = ['ETH', 'ARB'] as const

export const QuoteSchema = z.object({
  sourceChain: z.enum(EVM_SOURCE),
  amount: z.string().regex(/^(?!0+(\.0+)?$)(0|[1-9]\d{0,17})(\.\d{1,6})?$/, 'positive usdc amount, max 6 decimals'),
})

export const SendSchema = QuoteSchema.extend({
  fromAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'invalid evm address'),
  toAddress: z.string().regex(/^G[A-Z2-7]{55}$/, 'invalid stellar account id'),
})

export const ApproveSchema = QuoteSchema.extend({
  owner: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'invalid evm address'),
})
