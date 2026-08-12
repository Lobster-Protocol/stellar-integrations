// shared visual props for the dashboard recharts. they don't change with
// data, so keeping them outside the page render saves a render-time alloc.

export const TOOLTIP_STYLE = {
  background: '#fff',
  border: '1px solid rgba(13,45,76,0.1)',
  borderRadius: 12,
  fontSize: 12,
} as const

export const AXIS_TICK = { fontSize: 10, fill: '#9ca3af' } as const

export const GRID_STROKE = 'rgba(13, 45, 76, 0.06)'
