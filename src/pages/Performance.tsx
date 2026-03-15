import { useMemo, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { generateSnapshots, computeKPIs, filterByRange, formatUSD, type TimeRange } from '../data/mock'
import TimeRangeSelector from '../components/TimeRangeSelector'
import { cn } from '../utils/format'

export default function Performance() {
  const [range, setRange] = useState<TimeRange>('ALL')
  const allSnapshots = useMemo(() => generateSnapshots(), [])
  const snapshots = useMemo(() => filterByRange(allSnapshots, range), [allSnapshots, range])
  const kpis = useMemo(() => computeKPIs(allSnapshots), [allSnapshots])

  const chartData = snapshots.map(s => ({
    date: s.date,
    pnl: s.pnlPercent,
    value: s.portfolioValue,
    fees: s.fees,
    il: s.il,
  }))

  if (!kpis) return null

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-text">Strategy Performance</h2>
        <TimeRangeSelector value={range} onChange={setRange} />
      </div>

      {/* PnL chart */}
      <div className="bg-bg-card rounded-3xl p-5" style={{ border: '1px solid rgba(13, 45, 76, 0.08)', boxShadow: '0 12px 35px rgba(8, 10, 12, 0.08)' }}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-text">P&L (%)</h3>
          <span className={cn('text-sm font-semibold', kpis.totalPnlPercent >= 0 ? 'text-green' : 'text-red')}>
            {kpis.totalPnlPercent >= 0 ? '+' : ''}{kpis.totalPnlPercent}%
          </span>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="pnlUp" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(13, 45, 76, 0.06)" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(d: string) => d.slice(5)}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#9ca3af' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => `${v.toFixed(1)}%`}
            />
            <Tooltip
              contentStyle={{ background: '#fff', border: '1px solid rgba(13,45,76,0.1)', borderRadius: 12, fontSize: 12 }}
              formatter={(val: any) => [`${Number(val).toFixed(2)}%`, 'PnL']}
              labelFormatter={(l: any) => String(l)}
            />
            <Area type="monotone" dataKey="pnl" stroke="#10b981" strokeWidth={2} fill="url(#pnlUp)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* fees vs IL chart */}
      <div className="bg-bg-card rounded-3xl p-5" style={{ border: '1px solid rgba(13, 45, 76, 0.08)', boxShadow: '0 12px 35px rgba(8, 10, 12, 0.08)' }}>
        <h3 className="text-sm font-semibold text-text mb-2">Cumulative Fees vs Impermanent Loss</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(13, 45, 76, 0.06)" />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(d: string) => d.slice(5)} />
            <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} tickFormatter={(v: number) => formatUSD(v)} />
            <Tooltip
              contentStyle={{ background: '#fff', border: '1px solid rgba(13,45,76,0.1)', borderRadius: 12, fontSize: 12 }}
              formatter={(val: any, name: any) => [formatUSD(Number(val)), name === 'fees' ? 'Fees earned' : 'IL']}
            />
            <Area type="monotone" dataKey="fees" stroke="#3693fb" strokeWidth={1.5} fill="rgba(54, 147, 251, 0.1)" />
            <Area type="monotone" dataKey="il" stroke="#ef4444" strokeWidth={1.5} fill="rgba(239, 68, 68, 0.08)" />
          </AreaChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-6 mt-2 text-xs">
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 bg-primary inline-block rounded" /> Fees earned</span>
          <span className="flex items-center gap-1.5"><span className="w-2.5 h-0.5 bg-red inline-block rounded" /> Impermanent loss</span>
        </div>
      </div>

      {/* metrics grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricBox label="Net APR" value={`${kpis.apr}%`} positive />
        <MetricBox label="Sharpe Ratio" value={kpis.sharpe.toString()} positive={kpis.sharpe > 0} />
        <MetricBox label="Max Drawdown" value={`-${kpis.maxDrawdown}%`} positive={false} />
        <MetricBox label="Net Fees - IL" value={`${kpis.netFees >= 0 ? '+' : ''}${formatUSD(kpis.netFees)}`} positive={kpis.netFees >= 0} />
        <MetricBox label="Total Fees" value={formatUSD(kpis.totalFees)} />
        <MetricBox label="Total IL" value={formatUSD(kpis.totalIL)} />
        <MetricBox label="Migrations" value={kpis.migrations.toString()} />
        <MetricBox label="Arb Swaps" value={kpis.swaps.toString()} />
      </div>
    </div>
  )
}

function MetricBox({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="bg-bg-card rounded-2xl p-4" style={{ border: '1px solid rgba(13, 45, 76, 0.08)' }}>
      <p className="text-text-muted text-xs mb-1">{label}</p>
      <p className={cn(
        'text-base font-semibold',
        positive === true ? 'text-green' : positive === false ? 'text-red' : 'text-text'
      )} style={{ fontFamily: 'Outfit' }}>
        {value}
      </p>
    </div>
  )
}
