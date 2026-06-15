import { useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import {
  generateSnapshots,
  filterByRange,
  STRATEGY,
  getProtocolColor,
  computeProtocolTimeShare,
  type Protocol,
  type TimeRange,
} from '../data/mock'
import TimeRangeSelector from '../components/TimeRangeSelector'
import MockDataBadge from '../components/MockDataBadge'
import {
  TOOLTIP_STYLE,
  AXIS_TICK,
  GRID_STROKE,
  formatMonthDay,
  formatPercentTick,
} from '../utils/recharts'

const allSnapshots = generateSnapshots()

export default function Allocation() {
  const [range, setRange] = useState<TimeRange>('ALL')
  const snapshots = filterByRange(allSnapshots, range)

  const deltaData = snapshots.map(s => ({
    date: s.date,
    [STRATEGY.token0Symbol]: s.token0Ratio,
    [STRATEGY.token1Symbol]: 100 - s.token0Ratio,
  }))

  const protocolTime = computeProtocolTimeShare(snapshots)
  const totalDays = snapshots.length
  const latest = snapshots[snapshots.length - 1]

  return (
    <div className="space-y-6">
      <MockDataBadge />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-text">Token Allocation</h2>
        <TimeRangeSelector value={range} onChange={setRange} />
      </div>

      <div className="bg-bg-card rounded-3xl p-5 card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-text">Token Delta</h3>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-primary inline-block" /> {STRATEGY.token0Symbol}</span>
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: '#ff8770' }} /> {STRATEGY.token1Symbol}</span>
            <span className="text-text-muted">--- target 50%</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={deltaData} stackOffset="expand">
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
            <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={formatMonthDay} />
            <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={formatPercentTick} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(val) => [`${(Number(val) * 100).toFixed(1)}%`]}
            />
            <Area type="monotone" dataKey={STRATEGY.token0Symbol} stackId="1" stroke="#3693fb" fill="#3693fb" fillOpacity={0.6} />
            <Area type="monotone" dataKey={STRATEGY.token1Symbol} stackId="1" stroke="#ff8770" fill="#ff8770" fillOpacity={0.5} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-bg-card rounded-3xl p-5 card">
        <h3 className="text-sm font-semibold text-text mb-4">DEX Distribution Over Time</h3>

        {/* visual timeline bar */}
        <div className="flex rounded-full overflow-hidden h-6 mb-4">
          {Object.entries(protocolTime).map(([proto, days]) => (
            <div
              key={proto}
              className="flex items-center justify-center text-[10px] font-medium text-white"
              style={{
                width: `${(days / totalDays) * 100}%`,
                background: getProtocolColor(proto as Protocol),
              }}
            >
              {Math.round((days / totalDays) * 100)}%
            </div>
          ))}
        </div>

        <div className="flex items-center gap-6 text-xs">
          {Object.entries(protocolTime).map(([proto, days]) => (
            <div key={proto} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: getProtocolColor(proto as Protocol) }} />
              <span className="text-text-secondary capitalize">{proto}</span>
              <span className="text-text-muted">({days}d)</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-bg-card rounded-3xl p-5" style={{ border: '1px solid rgba(13, 45, 76, 0.08)' }}>
          <h3 className="text-sm font-semibold text-text mb-3">Current Token Balances</h3>
          {latest && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">{STRATEGY.token0Symbol}</span>
                <span className="text-sm text-text font-mono">{latest.token0Amount.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">{STRATEGY.token1Symbol}</span>
                <span className="text-sm text-text font-mono">{latest.token1Amount.toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-secondary">Ratio</span>
                <span className="text-sm text-text">{latest.token0Ratio}% / {(100 - latest.token0Ratio).toFixed(1)}%</span>
              </div>
            </div>
          )}
        </div>
        <div className="bg-bg-card rounded-3xl p-5" style={{ border: '1px solid rgba(13, 45, 76, 0.08)' }}>
          <h3 className="text-sm font-semibold text-text mb-3">Target Delta</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-text-secondary">Target ratio</span>
              <span className="text-text">50% / 50%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Rebalance zone</span>
              <span className="text-text">±5%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Hard limit</span>
              <span className="text-text">±15%</span>
            </div>
            <p className="text-[11px] text-text-muted mt-2">
              When token ratio drifts beyond the rebalance zone, the algo triggers an arbitrage swap to rebalance.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
