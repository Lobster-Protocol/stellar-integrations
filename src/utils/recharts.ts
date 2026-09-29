export const TOOLTIP_STYLE = {
  background: '#fff',
  border: '1px solid rgba(13,45,76,0.1)',
  borderRadius: 12,
  fontSize: 12,
} as const

export const AXIS_TICK = { fontSize: 10, fill: '#9ca3af' } as const

export const GRID_STROKE = 'rgba(13, 45, 76, 0.06)'

// the order keeps neighbouring slices distinct, including under deuteranopia
// and tritanopia, and each colour clears 3:1 contrast on a white card
export const CHART_COLORS = ['#3693fb', '#e8623f', '#9333ea', '#0f9b6c', '#b45309', '#0891b2']

// grey for the de-emphasised rest when one series is the point
export const CHART_MUTED = '#c3c9d4'
