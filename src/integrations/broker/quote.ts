import { estimateSwap } from '@stellar-broker/client'

import {
  type BrokerQuoteParams,
  type BrokerQuoteResult,
  BrokerQuoteParamsSchema,
  BrokerQuoteResultSchema,
} from './types'

// StellarBrokerError leaves .name as 'Error', so match the no-quote codes: 11 not
// set, 12 expired, 13 no liquidity or a failed fetch (estimateSwap throws 13, not 11).
const NO_QUOTE_CODES = new Set([11, 12, 13])

export async function quoteBroker(
  params: BrokerQuoteParams,
): Promise<BrokerQuoteResult | null> {
  BrokerQuoteParamsSchema.parse(params)
  try {
    const raw = await estimateSwap(params)
    return BrokerQuoteResultSchema.parse(raw)
  } catch (err) {
    // a DOMException reuses the legacy codes 11/12/13 for real transport faults.
    if (typeof DOMException !== 'undefined' && err instanceof DOMException) throw err
    const code = (err as { code?: unknown } | null)?.code
    if (typeof code === 'number' && NO_QUOTE_CODES.has(code)) return null
    throw err
  }
}
