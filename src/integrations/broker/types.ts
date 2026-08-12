import { z } from 'zod'

export const BrokerQuoteStatusSchema = z.enum(['unfeasible', 'rejected', 'success'])

// asset format: 'xlm' for native, otherwise CODE-ISSUER with a G... issuer
// (the broker has no soroban token support, a bare C... address is refused)
export const BrokerQuoteParamsSchema = z.object({
  sellingAsset: z.string().min(1),
  buyingAsset: z.string().min(1),
  sellingAmount: z.string().optional(),
  // the broker caps tolerance at 0.5, mirror it here instead of admitting a
  // value that only blows up once it reaches the sdk
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
