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

// Series colours, in fixed order. The previous set put #eab308 next to #f97316,
// which sit 14.8 apart in OKLab - close enough that they read as the same slice
// even with full colour vision, and four of the six fell under 3:1 against a
// white card. These six clear the lightness band, the chroma floor, deuteranopia
// and tritanopia separation, and contrast. Brand blue keeps slot 1; the coral is
// deepened from #ff8770, which stays an interface colour but is too pale to
// carry a slice. Assign in order, never cycle: a seventh series folds into
// "other" instead.
export const CHART_COLORS = ['#3693fb', '#e8623f', '#9333ea', '#0f9b6c', '#b45309', '#0891b2']

// scatter and small-multiple forms put any two marks side by side, which is a
// harder test than neighbouring slices. only the first three clear it.
export const CHART_COLORS_ALL_PAIRS = CHART_COLORS.slice(0, 3)

// grey for the de-emphasised rest when one series is the point
export const CHART_MUTED = '#c3c9d4'
