import { useMemo, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { generateSnapshots, filterByRange, STRATEGY, getProtocolColor, type TimeRange } from '../data/mock'
import TimeRangeSelector from '../components/TimeRangeSelector'

export default function Allocation() {
  const [range, setRange] = useState<TimeRange>('ALL')
  const allSnapshots = useMemo(() => generateSnapshots(), [])
  const snapshots = useMemo(() => filterByRange(allSnapshots, range), [allSnapshots, range])

  // token delta chart data
  const deltaData = snapshots.map(s => ({
    date: s.date,
    [STRATEGY.token0Symbol]: s.token0Ratio,
    [STRATEGY.token1Symbol]: 100 - s.token0Ratio,
  }))

  // count time on each protocol
  const protocolTime: Record<string, number> = {}
  for (const s of snapshots) {
    protocolTime[s.activeProtocol] = (protocolTime[s.activeProtocol] || 0) + 1
  }
  const totalDays = snapshots.length

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-text">Token Allocation</h2>
        <TimeRangeSelector value={range} onChange={setRange} />
      </div>

      {/* token delta stacked area */}
      <div className="bg-bg-card rounded-3xl p-5" style={{ border: '1px solid rgba(13, 45, 76, 0.08)', boxShadow: '0 12px 35px rgba(8, 10, 12, 0.08)' }}>
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
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(13, 45, 76, 0.06)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(d: string) => d.slice(5)} />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} />
            <Tooltip
              contentStyle={{ background: '#fff', border: '1px solid rgba(13,45,76,0.1)', borderRadius: 12, fontSize: 12 }}
              formatter={(val: any) => [`${(Number(val) * 100).toFixed(1)}%`]}
            />
            <Area type="monotone" dataKey={STRATEGY.token0Symbol} stackId="1" stroke="#3693fb" fill="#3693fb" fillOpacity={0.6} />
            <Area type="monotone" dataKey={STRATEGY.token1Symbol} stackId="1" stroke="#ff8770" fill="#ff8770" fillOpacity={0.5} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* protocol timeline */}
      <div className="bg-bg-card rounded-3xl p-5" style={{ border: '1px solid rgba(13, 45, 76, 0.08)', boxShadow: '0 12px 35px rgba(8, 10, 12, 0.08)' }}>
        <h3 className="text-sm font-semibold text-text mb-4">DEX Distribution Over Time</h3>

        {/* visual timeline bar */}
        <div className="flex rounded-full overflow-hidden h-6 mb-4">
          {Object.entries(protocolTime).map(([proto, days]) => (
            <div
              key={proto}
              className="flex items-center justify-center text-[10px] font-medium text-white"
              style={{
                width: `${(days / totalDays) * 100}%`,
                background: getProtocolColor(proto as any),
              }}
            >
              {Math.round((days / totalDays) * 100)}%
            </div>
          ))}
        </div>

        {/* legend */}
        <div className="flex items-center gap-6 text-xs">
          {Object.entries(protocolTime).map(([proto, days]) => (
            <div key={proto} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: getProtocolColor(proto as any) }} />
              <span className="text-text-secondary capitalize">{proto}</span>
              <span className="text-text-muted">({days}d)</span>
            </div>
          ))}
        </div>
      </div>

      {/* current position detail */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-bg-card rounded-3xl p-5" style={{ border: '1px solid rgba(13, 45, 76, 0.08)' }}>
          <h3 className="text-sm font-semibold text-text mb-3">Current Token Balances</h3>
          {(() => {
            const last = snapshots[snapshots.length - 1]
            if (!last) return null
            return (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">{STRATEGY.token0Symbol}</span>
                  <span className="text-sm text-text font-mono">{last.token0Amount.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">{STRATEGY.token1Symbol}</span>
                  <span className="text-sm text-text font-mono">{last.token1Amount.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-text-secondary">Ratio</span>
                  <span className="text-sm text-text">{last.token0Ratio}% / {(100 - last.token0Ratio).toFixed(1)}%</span>
                </div>
              </div>
            )
          })()}
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
