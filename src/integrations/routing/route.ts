// broker first, soroswap direct router when the broker has no path

import { quoteBroker } from '../broker/quote'
import { quoteSoroswapDirect } from '../broker/soroswap-fallback'
import { validateBrokerQuote, validateSoroswapQuote } from '../broker/validation'
import { brokerAssetToSac, toStroops } from '../broker/asset-mapping'
import { type Network } from '../../config/contracts'
import type { BrokerQuoteParams, BrokerQuoteResult } from '../broker/types'
import { getRoutingHealth } from './health'

export type RouteSource = 'broker' | 'soroswap-fallback' | 'none'

export interface RouteResult {
  source: RouteSource
  broker?: BrokerQuoteResult
  soroswap?: { buyingStroops: bigint; buyingAmount: string }
  reason?: string
}

export async function routeSwap(
  params: BrokerQuoteParams,
  ctx: { network: Network; callerAccount: string },
): Promise<RouteResult> {
  const health = getRoutingHealth(ctx.network)

  // quoting is keyless, so we ask the broker for a price whenever the endpoint
  // is set. the same quote becomes the executable route when the partner key
  // is present, or a best-execution reference next to the soroswap leg when it
  // is not.
  let broker: BrokerQuoteResult | undefined
  if (health.brokerQuoteEnabled) {
    try {
      const quote = await quoteBroker(params)
      if (quote && quote.status === 'success' && validateBrokerQuote(quote).ok) {
        broker = quote
        if (health.brokerEnabled) return { source: 'broker', broker }
      }
    } catch {
      // a broker hiccup (pair it doesn't cover, sub-minimum amount, endpoint
      // down) must not sink the whole route. leave broker unset and fall through
      // to the soroswap leg, or to a clean 'none' reason below, instead of
      // throwing up to the swap modal and leaving it blank.
    }
  }

  if (!health.fallbackEnabled) {
    return { source: 'none', broker, reason: 'no router available on this network' }
  }

  const sellingTokenId = brokerAssetToSac(params.sellingAsset, ctx.network)
  const buyingTokenId = brokerAssetToSac(params.buyingAsset, ctx.network)
  if (!sellingTokenId || !buyingTokenId) {
    return { source: 'none', broker, reason: 'asset to SAC mapping not available' }
  }

  const amountInStroops = toStroops(params.sellingAmount)
  if (!amountInStroops) return { source: 'none', broker, reason: 'invalid amount' }

  const buyingStroops = await quoteSoroswapDirect({
    network: ctx.network,
    callerAccount: ctx.callerAccount,
    sellingTokenId,
    buyingTokenId,
    amountInStroops,
  })
  if (buyingStroops === null) return { source: 'none', broker, reason: 'no path on soroswap' }

  const guard = validateSoroswapQuote({
    sellingStroops: amountInStroops,
    buyingStroops,
    sellingAsset: sellingTokenId,
    buyingAsset: buyingTokenId,
  })
  if (!guard.ok) return { source: 'none', broker, reason: `soroswap quote rejected: ${guard.reason}` }

  return {
    source: 'soroswap-fallback',
    broker,
    soroswap: { buyingStroops, buyingAmount: (Number(buyingStroops) / 10_000_000).toString() },
  }
}
