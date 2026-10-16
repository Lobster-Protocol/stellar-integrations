import type { VaultPosition } from './position'

// Where the value of a vault sits once the pool has answered. A working vault can still
// keep most of its tokens idle (a deposit the engine has not allocated yet), so the two
// sides are compared by value.
export type VaultSplit = 'pool' | 'vault' | 'both'

export function vaultSplit(
  v: Pick<VaultPosition, 'token0' | 'token1' | 'amount0' | 'amount1' | 'pooled0' | 'pooled1'>,
  priceOf: (tokenId: string) => number | null,
): VaultSplit | null {
  if (v.pooled0 === null && v.pooled1 === null) return null
  const idle = [Number(v.amount0), Number(v.amount1)]
  const pooled = [Number(v.pooled0 ?? 0), Number(v.pooled1 ?? 0)]
  const anyIdle = idle.some((a) => a > 0)
  if (!pooled.some((a) => a > 0)) return anyIdle ? 'vault' : null
  if (!anyIdle) return 'pool'
  const p0 = priceOf(v.token0)
  const p1 = priceOf(v.token1)
  // without both prices the two tokens can't be added up, so say only that both hold some
  if (p0 == null || p1 == null) return 'both'
  const worth = ([a0, a1]: number[]) => a0 * p0 + a1 * p1
  return worth(pooled) >= worth(idle) ? 'pool' : 'vault'
}
