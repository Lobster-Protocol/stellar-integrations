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

  if (health.brokerEnabled) {
    const broker = await quoteBroker(params)
    if (broker && broker.status === 'success') {
      const check = validateBrokerQuote(broker)
      if (check.ok) return { source: 'broker', broker }
      // broker quote failed validation; fall through to soroswap
    }
  }

  if (!health.fallbackEnabled) {
    return { source: 'none', reason: 'no router available on this network' }
  }

  const sellingTokenId = brokerAssetToSac(params.sellingAsset, ctx.network)
  const buyingTokenId = brokerAssetToSac(params.buyingAsset, ctx.network)
  if (!sellingTokenId || !buyingTokenId) {
    return { source: 'none', reason: 'asset to SAC mapping not available' }
  }

  const amountInStroops = toStroops(params.sellingAmount)
  if (!amountInStroops) return { source: 'none', reason: 'invalid amount' }

  const buyingStroops = await quoteSoroswapDirect({
    network: ctx.network,
    callerAccount: ctx.callerAccount,
    sellingTokenId,
    buyingTokenId,
    amountInStroops,
  })
  if (buyingStroops === null) return { source: 'none', reason: 'no path on soroswap' }

  const guard = validateSoroswapQuote({
    sellingStroops: amountInStroops,
    buyingStroops,
    sellingAsset: sellingTokenId,
    buyingAsset: buyingTokenId,
  })
  if (!guard.ok) return { source: 'none', reason: `soroswap quote rejected: ${guard.reason}` }

  return {
    source: 'soroswap-fallback',
    soroswap: { buyingStroops, buyingAmount: (Number(buyingStroops) / 10_000_000).toString() },
  }
}
