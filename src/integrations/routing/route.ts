import { quoteBroker } from '../broker/quote'
import { quoteSoroswapDirect } from '../broker/soroswap-fallback'
import { validateBrokerQuote, validateSoroswapQuote } from '../broker/validation'
import { brokerAssetToSac, toStroops } from '../broker/asset-mapping'
import { stroopsToDecimal } from '../stellar/amount'
import { type Network } from '../../config/contracts'
import type { BrokerQuoteParams, BrokerQuoteResult } from '../broker/types'
import { getRoutingHealth } from './health'

export type RouteSource = 'soroswap-fallback' | 'none'

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

  // the broker quote rides along as a best-execution reference next to the soroswap
  // leg. the swap panel cannot sign a broker route, so the quote never becomes the
  // route, partner key or not: otherwise no mainnet pair could be swapped at all.
  let broker: BrokerQuoteResult | undefined
  if (health.brokerQuoteEnabled) {
    try {
      const quote = await quoteBroker(params)
      if (quote && quote.status === 'success' && validateBrokerQuote(quote).ok) {
        broker = quote
      }
    } catch {
      // an unsupported pair, a sub-minimum amount or a down endpoint must not sink
      // the route: fall through to the soroswap leg rather than blank the swap modal
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
    // exact 7-decimal string, trailing zeros trimmed for the estimate line
    soroswap: { buyingStroops, buyingAmount: stroopsToDecimal(buyingStroops).replace(/\.?0+$/, '') },
  }
}
