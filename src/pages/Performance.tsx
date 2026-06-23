import { useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useAccountBalances } from '../integrations/horizon/account'
import { useXlmUsd, valueBalances } from '../integrations/pricing/price'
import { useRecordNav, readNavHistory } from '../integrations/pricing/nav'
import { formatUSD, cn } from '../utils/format'
import { TOOLTIP_STYLE, AXIS_TICK, GRID_STROKE } from '../utils/recharts'
import Hint from '../components/Hint'

export default function Performance() {
  const { address } = useWallet()
  const { network } = useNetwork()
  const balancesQ = useAccountBalances(network, address)
  const priceQ = useXlmUsd(network)

  const { usdTotal } = valueBalances(balancesQ.data ?? [], priceQ.data ?? null)
  useRecordNav(network, address, usdTotal)

  const history = useMemo(() => readNavHistory(network, address), [network, address, usdTotal])

  if (!address) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-text">Performance</h2>
        <p className="text-sm text-text-muted">Connect a wallet to track its performance.</p>
      </div>
    )
  }

  const chartData = history.map((p) => ({
    date: new Date(p.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: p.usd,
  }))
  const first = history[0]
  const latest = history[history.length - 1]
  const change = first && latest && first.usd > 0 ? ((latest.usd - first.usd) / first.usd) * 100 : null

  // max drawdown over the real series, peak to trough
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

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-text">Performance</h2>

      {usdTotal == null ? (
        <div className="bg-bg-card rounded-3xl p-5 card">
          <p className="text-sm text-text-secondary">
            Performance is valued in USD, which only exists on mainnet. Switch to mainnet to track this wallet.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <MetricBox label="Portfolio Value" value={formatUSD(usdTotal)} />
            <MetricBox
              label="Change Since Tracking"
              value={change != null ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : 'n/a'}
              positive={change != null ? change >= 0 : undefined}
              hint="Move in this wallet's value since the first recorded snapshot."
            />
            <MetricBox
              label="Max Drawdown"
              value={drawdown != null ? `${drawdown.toFixed(2)}%` : 'n/a'}
              positive={false}
              hint="Deepest peak-to-trough drop across the recorded snapshots."
            />
          </div>

          <div className="bg-bg-card rounded-3xl p-5 card">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-text">
                <Hint label="Portfolio Value" text="Recorded from live snapshots of this wallet's on-chain value as you use the dashboard." />
              </h3>
              <span className="text-xs text-text-muted">{history.length} snapshot{history.length === 1 ? '' : 's'}</span>
            </div>
            {history.length < 2 ? (
              <p className="text-sm text-text-muted py-8 text-center">
                Performance history starts now. The chart fills in as snapshots accrue, one per hour of use.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="navGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3693fb" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#3693fb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="date" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                  <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} tickFormatter={(v) => formatUSD(Number(v))} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(val) => [formatUSD(Number(val)), 'Value']} />
                  <Area type="monotone" dataKey="value" stroke="#3693fb" strokeWidth={2} fill="url(#navGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function MetricBox({ label, value, positive, hint }: { label: string; value: string; positive?: boolean; hint?: string }) {
  return (
    <div className="bg-bg-card rounded-2xl p-4" style={{ border: '1px solid rgba(13, 45, 76, 0.08)' }}>
      <p className="text-text-muted text-xs mb-1">{hint ? <Hint label={label} text={hint} align="center" /> : label}</p>
      <p
        className={cn(
          'text-base font-semibold',
          positive === true ? 'text-green' : positive === false ? 'text-red' : 'text-text',
        )}
        style={{ fontFamily: 'Outfit' }}
      >
        {value}
      </p>
    </div>
  )
}
