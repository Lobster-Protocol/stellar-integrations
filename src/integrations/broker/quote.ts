import { estimateSwap } from '@stellar-broker/client'

import {
  type BrokerQuoteParams,
  type BrokerQuoteResult,
  BrokerQuoteParamsSchema,
  BrokerQuoteResultSchema,
} from './types'

// broker code 11: "Price quote not available" (server-side no-liquidity signal)
const QUOTE_NOT_AVAILABLE = 11

// the sdk index.js re-exports StellarBrokerClient + estimate + mediator but
// not the error class. detecting by name keeps us independent of which
// subpath the runtime tree-shakes.
function isNoQuoteAvailable(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  if (err.name !== 'StellarBrokerError') return false
  return (err as Error & { code?: number }).code === QUOTE_NOT_AVAILABLE
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
