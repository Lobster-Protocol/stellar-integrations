import type { BrokerQuoteResult } from './types'

// local sanity checks before a confirm. heuristic stand-in until the analytics api is wired.

const MAX_SLIPPAGE = 0.05
// implausibly large profit usually means a thin pool or stale quote
const MAX_ABSOLUTE_PROFIT = 0.5
// a broker output well above the direct-trade estimate on the same path reads as
// a stale or gamed number, not a better route
const MAX_BROKER_DIRECT_RATIO = 3

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
  if (Number.isFinite(direct) && direct > 0 && broker / direct > MAX_BROKER_DIRECT_RATIO) {
    return { ok: false, reason: `broker output over ${MAX_BROKER_DIRECT_RATIO}x direct trade, suspicious` }
  }
  return { ok: true }
}

// soroswap direct quotes do not carry a directTrade reference. real Stellar
// tokens span orders of magnitude in unit price - a cheap token pays out
// hundreds of units per XLM - so a tight amount-ratio ceiling wrongly rejects
// legitimate quotes. keep only a very high backstop against a garbage/overflow
// value; the on-chain minAmountOut is what actually caps slippage at execution.
const SOROSWAP_MAX_RATIO = 1_000_000_000n
// how far the pool rate may sit from an external reference before the quote
// reads as stale
const MAX_REFERENCE_DRIFT = 0.5

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
  if (c.buyingStroops > c.sellingStroops * SOROSWAP_MAX_RATIO) {
    return { ok: false, reason: 'buying / selling ratio implausibly high, likely a broken quote' }
  }
  if (c.referenceRate && Number.isFinite(c.referenceRate) && c.referenceRate > 0) {
    const ratio = Number(c.buyingStroops) / Number(c.sellingStroops)
    const drift = Math.abs(ratio - c.referenceRate) / c.referenceRate
    if (drift > MAX_REFERENCE_DRIFT) {
      return { ok: false, reason: `ratio drift ${drift.toFixed(2)} above ${MAX_REFERENCE_DRIFT} vs reference` }
    }
  }
  return { ok: true }
}
