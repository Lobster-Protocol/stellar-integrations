// shared visual props for the dashboard recharts. they don't change with
// data, so keeping them outside the page render saves a render-time alloc.

import { formatUSD } from './format'

export const TOOLTIP_STYLE = {
  background: '#fff',
  border: '1px solid rgba(13,45,76,0.1)',
  borderRadius: 12,
  fontSize: 12,
} as const

export const AXIS_TICK = { fontSize: 10, fill: '#9ca3af' } as const

export const GRID_STROKE = 'rgba(13, 45, 76, 0.06)'

// XAxis tickFormatter: strip the YYYY- prefix so the axis shows MM-DD only
export const formatMonthDay = (date: string): string => date.slice(5)

// YAxis tickFormatter: 0.42 -> 42%
export const formatPercentTick = (v: number): string => `${(v * 100).toFixed(0)}%`

// YAxis tickFormatter for signed percent values: 4.2 -> 4.2%
export const formatSignedPercentTick = (v: number): string => `${v.toFixed(1)}%`

// YAxis tickFormatter: 12345 -> $12.3K
export const formatUsdTick = (v: number): string => formatUSD(v)
