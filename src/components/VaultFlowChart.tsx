import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import type { VaultFlowSeries } from '../integrations/lobster/vault-flows'
import { compactNumber, formatBalance } from '../utils/format'
import { AXIS_TICK, CHART_COLORS, GRID_STROKE, TOOLTIP_STYLE } from '../utils/recharts'
import { ChartFrame } from './ui'

const day = (ts: number) =>
  new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

const signed = (amount: string) => `${Number(amount) > 0 ? '+' : ''}${formatBalance(amount)}`

// The running total of what this wallet has moved into a vault, less what it has
// taken back, one small panel per token. Two tokens rarely share a scale (500
// XLM against 1000 LOBS), so they get a panel each rather than one axis that
// flattens the smaller of them.
export default function VaultFlowChart({
  series,
  complete,
}: {
  series: VaultFlowSeries
  complete: boolean
}) {
  return (
    <div>
      <div className={series.codes.length > 1 ? 'grid grid-cols-2 gap-3' : ''}>
        {series.codes.map((code, i) => {
          const data = series.points.map((p) => ({ ts: p.ts, v: p.net[code] }))
          const colour = CHART_COLORS[i % CHART_COLORS.length]
          return (
            <div key={code}>
              <div className="flex items-baseline justify-between gap-2 mb-0.5">
                <span className="text-[11px] font-medium text-text">{code}</span>
                <span className="text-[11px] tabular-nums">
                  <span className="text-text">{signed(series.net[code])}</span>
                  <span className="text-text-muted"> net</span>
                </span>
              </div>
              <ChartFrame
                label={`${code} moved into this vault over time, less what was taken back`}
                columns={['Date', `Net ${code}`]}
                rows={series.points.map((p) => [
                  new Date(p.ts).toLocaleDateString('en-GB'),
                  formatBalance(String(p.net[code])),
                ])}
              >
                <ResponsiveContainer width="100%" height={104}>
                  <LineChart data={data} margin={{ left: 0, right: 6, top: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                    <XAxis
                      dataKey="ts"
                      type="number"
                      scale="time"
                      domain={['dataMin', 'dataMax']}
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={40}
                      tickFormatter={day}
                    />
                    <YAxis
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                      width={44}
                      tickFormatter={(v) => compactNumber(Number(v))}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelFormatter={(v) => new Date(Number(v)).toLocaleString('en-GB')}
                      formatter={(v) => [formatBalance(String(v)), `Net ${code}`]}
                    />
                    {/* one move draws no segment, so the dot is what makes a
                        single deposit visible at all */}
                    <Line
                      type="stepAfter"
                      dataKey="v"
                      stroke={colour}
                      strokeWidth={2}
                      dot={{ r: 2, fill: colour, strokeWidth: 0 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ChartFrame>
              <div className="text-[10px] text-text-muted tabular-nums mt-0.5">
                in {formatBalance(series.putIn[code])}, back {formatBalance(series.takenBack[code])}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-[11px] text-text-muted mt-2">
        This is not a return. What the position earns or loses inside the pool stays in the vault, so
        it never crosses your wallet and cannot show up on this line.
      </p>
      {!complete && (
        <p className="text-[11px] text-text-muted mt-1">
          This wallet has more history than one read covers, so the total starts partway through.
        </p>
      )}
    </div>
  )
}
