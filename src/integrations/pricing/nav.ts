import { useEffect } from 'react'

import type { Network } from '../../config/contracts'

// Net asset value history, sampled while the dashboard is open. No on-chain
// feed exists for a wallet's portfolio value over time, so we record it
// ourselves: each visit with a priced portfolio appends one point, at most
// once an hour.

export interface NavPoint {
  ts: number
  usd: number
}

const MIN_GAP_MS = 60 * 60 * 1000
const MAX_POINTS = 1000
const key = (network: Network, address: string) => `lob_nav_${network}_${address}`

export function readNavHistory(network: Network, address: string | null): NavPoint[] {
  if (!address) return []
  try {
    const raw = localStorage.getItem(key(network, address))
    return raw ? (JSON.parse(raw) as NavPoint[]) : []
  } catch {
    return []
  }
}

export interface NavStats {
  change: number | null // percent move since the first snapshot
  drawdown: number | null // deepest peak-to-trough drop, percent (<= 0)
}

// portfolio stats over the recorded series: total move since the first point,
// and the worst peak-to-trough drawdown (which needs at least two points).
export function computeNavStats(history: NavPoint[]): NavStats {
  const first = history[0]
  const latest = history[history.length - 1]
  // one snapshot compares against itself and always reads 0%, which looks like a
  // measured flat move rather than the absence of one
  const change =
    history.length >= 2 && first.usd > 0 ? ((latest.usd - first.usd) / first.usd) * 100 : null

  let drawdown: number | null = null
  if (history.length >= 2) {
    let peak = history[0].usd
    let worst = 0
    for (const p of history) {
      if (p.usd > peak) peak = p.usd
      if (peak > 0) worst = Math.min(worst, (p.usd - peak) / peak)
    }
    drawdown = worst * 100
  }
  return { change, drawdown }
}

export function recordNav(network: Network, address: string | null, usd: number | null): void {
  if (!address || usd == null || !Number.isFinite(usd)) return
  try {
    const hist = readNavHistory(network, address)
    const last = hist[hist.length - 1]
    const now = Date.now()
    if (last && now - last.ts < MIN_GAP_MS) return
    hist.push({ ts: now, usd })
    localStorage.setItem(key(network, address), JSON.stringify(hist.slice(-MAX_POINTS)))
  } catch {
    // localStorage unavailable; skip silently
  }
}

// records one point per render where the portfolio is priced, throttled by recordNav
export function useRecordNav(network: Network, address: string | null, usd: number | null): void {
  useEffect(() => {
    recordNav(network, address, usd)
  }, [network, address, usd])
}
