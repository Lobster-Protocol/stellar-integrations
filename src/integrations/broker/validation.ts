import type { BrokerQuoteResult } from './types'

// local sanity checks before a confirm. heuristic stand-in until the analytics api is wired.

const MAX_SLIPPAGE = 0.05
// implausibly large profit usually means a thin pool or stale quote
const MAX_ABSOLUTE_PROFIT = 0.5

export type ValidationResult = { ok: true } | { ok: false; reason: string }

export function validateBrokerQuote(q: BrokerQuoteResult): ValidationResult {
  if (q.status !== 'success') return { ok: false, reason: `quote status ${q.status}` }
  if (!q.estimatedBuyingAmount || Number(q.estimatedBuyingAmount) <= 0) {
    return { ok: false, reason: 'output amount is zero or negative' }
  }
  if (q.slippageTolerance > MAX_SLIPPAGE) {
    return { ok: false, reason: `slippage ${q.slippageTolerance} above max ${MAX_SLIPPAGE}` }
  }
  const profit = Number(q.profit)
  if (Number.isFinite(profit) && Math.abs(profit) > MAX_ABSOLUTE_PROFIT) {
    return { ok: false, reason: `profit ${profit} above sanity threshold ${MAX_ABSOLUTE_PROFIT}` }
  }
  if (!q.directTrade) return { ok: true }
  const direct = Number(q.directTrade.buying)
  const broker = Number(q.estimatedBuyingAmount)
  // broker quote should never be more than ~3x direct on the same path
  if (Number.isFinite(direct) && direct > 0 && broker / direct > 3) {
    return { ok: false, reason: `broker output 3x direct trade, suspicious` }
  }
  return { ok: true }
}

// soroswap direct quotes do not carry a directTrade reference, so we only
// guard against zero/negative output and a hard 10x ratio ceiling.
const SOROSWAP_MAX_RATIO = 10n

export interface SoroswapQuoteCheck {
  sellingStroops: bigint
  buyingStroops: bigint
  sellingAsset: string
  buyingAsset: string
  referenceRate?: number
}

export function validateSoroswapQuote(c: SoroswapQuoteCheck): ValidationResult {
  if (c.buyingStroops <= 0n) return { ok: false, reason: 'output amount is zero or negative' }
  if (c.sellingStroops <= 0n) return { ok: false, reason: 'input amount is zero or negative' }
  if (c.sellingAsset === c.buyingAsset) return { ok: false, reason: 'selling and buying assets identical' }
  // raw ratio sanity. for same-decimal pairs a 10x ceiling catches stale pools.
  if (c.buyingStroops > c.sellingStroops * SOROSWAP_MAX_RATIO) {
    return { ok: false, reason: `buying / selling ratio above ${SOROSWAP_MAX_RATIO}x ceiling` }
  }
  if (c.referenceRate && Number.isFinite(c.referenceRate) && c.referenceRate > 0) {
    const ratio = Number(c.buyingStroops) / Number(c.sellingStroops)
    const drift = Math.abs(ratio - c.referenceRate) / c.referenceRate
    if (drift > 0.5) return { ok: false, reason: `ratio drift ${drift.toFixed(2)} above 0.5 vs reference` }
  }
  return { ok: true }
}
