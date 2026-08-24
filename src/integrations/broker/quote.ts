import { estimateSwap } from '@stellar-broker/client'

import {
  type BrokerQuoteParams,
  type BrokerQuoteResult,
  BrokerQuoteParamsSchema,
  BrokerQuoteResultSchema,
} from './types'

// StellarBrokerError carries a numeric code but never sets .name (it stays
// 'Error'), and estimateSwap throws code 13 for a missing quote, not 11. so
// detect the no-quote family by code: 11 not-set, 12 expired, 13 quote error (no
// liquidity or a failed fetch). anything without a broker code (a zod parse error,
// a transport failure) is a real fault and rethrows.
const NO_QUOTE_CODES = new Set([11, 12, 13])

function isNoQuoteAvailable(err: unknown): boolean {
  // a DOMException carries the same legacy numeric codes (11/12/13), so exclude it
  // rather than swallow a real transport fault as a missing quote.
  if (typeof DOMException !== 'undefined' && err instanceof DOMException) return false
  const code = (err as { code?: unknown } | null)?.code
  return typeof code === 'number' && NO_QUOTE_CODES.has(code)
}

export async function quoteBroker(
  params: BrokerQuoteParams,
): Promise<BrokerQuoteResult | null> {
  BrokerQuoteParamsSchema.parse(params)
  try {
    const raw = await estimateSwap(params)
    return BrokerQuoteResultSchema.parse(raw)
  } catch (err) {
    if (isNoQuoteAvailable(err)) return null
    throw err
  }
}
