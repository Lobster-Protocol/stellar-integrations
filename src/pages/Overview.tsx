import { useMemo, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts'
import { generateSnapshots, computeKPIs, STRATEGY, formatUSD, getProtocolColor, getProtocolLabel } from '../data/mock'
import { useWallet } from '../contexts/WalletContext'
import lobsterIcon from '../assets/lobster-icon.png'
import { cn } from '../utils/format'
import DepositModal from '../components/DepositModal'

export default function Overview() {
  const { address, connect } = useWallet()
  const snapshots = useMemo(() => generateSnapshots(), [])
  const kpis = useMemo(() => computeKPIs(snapshots), [snapshots])
  const last = snapshots[snapshots.length - 1]

  if (!address) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-5">
        <img src={lobsterIcon} alt="" className="w-20 h-20 opacity-70" />
        <h2 className="text-xl font-semibold text-text">Connect your wallet to get started</h2>
        <p className="text-text-secondary text-sm max-w-sm text-center">
          Deposit funds and let Lobster optimize your liquidity positions across Stellar DEXs.
        </p>
        <button
          onClick={connect}
          className="px-6 py-2.5 rounded-full bg-primary hover:bg-primary-dark text-white font-semibold transition-all"
          style={{ boxShadow: '0 10px 25px rgba(54, 147, 251, 0.25)' }}
        >
          Connect Wallet
        </button>
      </div>
    )
  }

  const [depositOpen, setDepositOpen] = useState(false)

  if (!kpis) return null

  // mini chart data (last 30 days)
  const chartData = snapshots.slice(-30).map(s => ({
    date: s.date.slice(5), // MM-DD
    value: s.portfolioValue,
  }))

  // allocation data for donuts
  const tokenAlloc = [
    { name: STRATEGY.token0Symbol, value: last.token0Ratio },
    { name: STRATEGY.token1Symbol, value: 100 - last.token0Ratio },
  ]
  const TOKEN_COLORS = ['#3693fb', '#ff8770']

  // protocol distribution (simplified — show active + historical)
  const protocolDist = [
    { name: 'Aquarius', value: 45 },
    { name: 'Soroswap', value: 35 },
    { name: 'Phoenix', value: 20 },
  ]
  const PROTO_COLORS = [getProtocolColor('aquarius'), getProtocolColor('soroswap'), getProtocolColor('phoenix')]

  return (
    <div className="space-y-6">
      <DepositModal open={depositOpen} onClose={() => setDepositOpen(false)} />

      {/* action bar */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text">Portfolio</h2>
        <button
          onClick={() => setDepositOpen(true)}
          className="px-5 py-2 rounded-full bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-all"
          style={{ boxShadow: '0 8px 20px rgba(54, 147, 251, 0.2)' }}
        >
          + Deposit
        </button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Portfolio Value" value={formatUSD(kpis.currentValue)} />
        <KPICard
          label="Total P&L"
          value={`${kpis.totalPnlPercent >= 0 ? '+' : ''}${kpis.totalPnlPercent}%`}
          sub={`${kpis.totalPnl >= 0 ? '+' : ''}${formatUSD(kpis.totalPnl)}`}
          color={kpis.totalPnl >= 0 ? '#10b981' : '#ef4444'}
        />
        <KPICard label="Sharpe Ratio" value={kpis.sharpe.toString()} />
        <KPICard label="Max Drawdown" value={`${kpis.maxDrawdown}%`} color="#ef4444" />
      </div>

      {/* main content grid */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* mini PnL chart */}
        <div className="lg:col-span-2 bg-bg-card rounded-3xl p-5" style={{ border: '1px solid rgba(13, 45, 76, 0.08)', boxShadow: '0 12px 35px rgba(8, 10, 12, 0.08)' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text">Portfolio Value (30D)</h3>
            <span className="text-xs text-text-muted">{STRATEGY.name}</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="pnlGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3693fb" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#3693fb" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis hide domain={['dataMin - 500', 'dataMax + 500']} />
              <Tooltip
                contentStyle={{ background: '#fff', border: '1px solid rgba(13,45,76,0.1)', borderRadius: 12, fontSize: 12 }}
                formatter={(val: any) => [formatUSD(val), 'Value']}
              />
              <Area type="monotone" dataKey="value" stroke="#3693fb" strokeWidth={2} fill="url(#pnlGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* current position card */}
        <div className="bg-bg-card rounded-3xl p-5" style={{ border: '1px solid rgba(13, 45, 76, 0.08)', boxShadow: '0 12px 35px rgba(8, 10, 12, 0.08)' }}>
          <h3 className="text-sm font-semibold text-text mb-4">Active Position</h3>
          <div className="flex items-center gap-2 mb-3">
            <span
              className="px-2.5 py-0.5 rounded-full text-xs font-medium"
              style={{ background: getProtocolColor(last.activeProtocol) + '15', color: getProtocolColor(last.activeProtocol) }}
            >
              {getProtocolLabel(last.activeProtocol)}
            </span>
            <span className="text-xs text-text-muted">{last.activePool}</span>
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-text-muted">APR</span>
              <span className="text-green font-medium">{last.apr}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Fees earned</span>
              <span className="text-text">{formatUSD(last.fees)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Impermanent loss</span>
              <span className="text-red text-xs">{formatUSD(last.il)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Net (fees - IL)</span>
              <span className={cn('font-medium', kpis.netFees >= 0 ? 'text-green' : 'text-red')}>
                {kpis.netFees >= 0 ? '+' : ''}{formatUSD(kpis.netFees)}
              </span>
            </div>
            <hr className="border-border" />
            <div className="flex justify-between">
              <span className="text-text-muted">Migrations</span>
              <span className="text-text">{kpis.migrations}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Arb swaps</span>
              <span className="text-text">{kpis.swaps}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-muted">Days active</span>
              <span className="text-text">{kpis.daysActive}</span>
            </div>
          </div>
        </div>
      </div>

      {/* allocation donuts */}
      <div className="grid md:grid-cols-2 gap-4">
        <DonutCard title="Token Allocation" data={tokenAlloc} colors={TOKEN_COLORS} />
        <DonutCard title="DEX Distribution (time-weighted)" data={protocolDist} colors={PROTO_COLORS} />
      </div>
    </div>
  )
}

function KPICard({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div
      className="rounded-3xl p-5"
      style={{
        background: 'linear-gradient(135deg, rgba(54, 147, 251, 0.12), rgba(255, 135, 112, 0.08))',
        border: '1px solid rgba(13, 45, 76, 0.06)',
      }}
    >
      <p className="text-text-secondary text-xs uppercase tracking-wider mb-1.5 font-medium">{label}</p>
      <p className="text-xl font-bold" style={{ color: color || '#080a0c', fontFamily: 'Outfit' }}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: color || '#6d7f9c' }}>{sub}</p>}
    </div>
  )
}

function DonutCard({ title, data, colors }: { title: string; data: { name: string; value: number }[]; colors: string[] }) {
  return (
    <div className="bg-bg-card rounded-3xl p-5" style={{ border: '1px solid rgba(13, 45, 76, 0.08)', boxShadow: '0 12px 35px rgba(8, 10, 12, 0.08)' }}>
      <h3 className="text-sm font-semibold text-text mb-4">{title}</h3>
      <div className="flex items-center gap-6">
        <ResponsiveContainer width={120} height={120}>
          <PieChart>
            <Pie data={data} innerRadius={35} outerRadius={55} paddingAngle={3} dataKey="value" stroke="none">
              {data.map((_, i) => <Cell key={i} fill={colors[i]} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="space-y-2">
          {data.map((d, i) => (
            <div key={d.name} className="flex items-center gap-2 text-sm">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: colors[i] }} />
              <span className="text-text-secondary">{d.name}</span>
              <span className="text-text font-medium ml-auto">{d.value}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
