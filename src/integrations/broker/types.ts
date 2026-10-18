import { z } from 'zod'

export const BrokerQuoteStatusSchema = z.enum(['unfeasible', 'rejected', 'success'])

// 'xlm' or CODE-ISSUER; the broker has no soroban token support and refuses a bare C...
export const BrokerQuoteParamsSchema = z.object({
  sellingAsset: z.string().min(1),
  buyingAsset: z.string().min(1),
  sellingAmount: z.string().optional(),
  // the broker caps tolerance at 0.5; fail here, not deep in the sdk
  slippageTolerance: z.number().min(0).max(0.5).optional(),
})
export type BrokerQuoteParams = z.infer<typeof BrokerQuoteParamsSchema>

export const BrokerDirectTradeSchema = z.object({
  selling: z.string(),
  buying: z.string(),
  path: z.array(z.string()),
})

export const BrokerQuoteResultSchema = z.object({
  ts: z.coerce.date(),
  status: BrokerQuoteStatusSchema,
  sellingAsset: z.string(),
  buyingAsset: z.string(),
  slippageTolerance: z.number(),
  sellingAmount: z.string(),
  estimatedBuyingAmount: z.string().optional(),
  directTrade: BrokerDirectTradeSchema.optional(),
  profit: z.string(),
  error: z.string().optional(),
})
export type BrokerQuoteResult = z.infer<typeof BrokerQuoteResultSchema>
