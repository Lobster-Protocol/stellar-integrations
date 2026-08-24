import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useAccountBalances } from '../integrations/horizon/account'
import { useXlmPrice, valueBalances, priceUnit } from '../integrations/pricing/price'
import {
  useBalanceHistory,
  valueAtCurrentPrice,
  assetKey,
  keyCode,
} from '../integrations/pricing/history'
import { useRecordNav, readNavHistory, computeNavStats } from '../integrations/pricing/nav'
import { CONTRACTS } from '../config/contracts'
import { compactNumber, formatBalance, formatValue } from '../utils/format'
import { AXIS_TICK, CHART_COLORS, GRID_STROKE, TOOLTIP_STYLE } from '../utils/recharts'
import { Card, CardHead, Empty, Failed, Stat } from '../components/ui'

const day = (ts: number) =>
  new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

// one chart row: the fixed fields plus one column per asset key held
interface Row {
  ts: number
  label: string
  value: number
  [asset: string]: number | string
}

export default function Performance() {
  const { address } = useWallet()
  const { network } = useNetwork()
  const balancesQ = useAccountBalances(network, address)
  const priceQ = useXlmPrice(network)
  const historyQ = useBalanceHistory(network, address)

  const unit = priceUnit(network)
  const price = priceQ.data ?? null
  const { usdTotal } = valueBalances(balancesQ.data ?? [], price, network)
  useRecordNav(network, address, usdTotal)

  // only assets whose identity we can pin down get a price, so a look-alike
  // token can never lift the curve
  const priceByKey = useMemo(() => {
    const m: Record<string, number> = {}
    if (price != null) m.XLM = price
    const issuer = CONTRACTS[network].tokens.usdcIssuer
    if (issuer) m[assetKey('USDC', issuer)] = 1
    return m
  }, [price, network])

  const history = historyQ.data

  // biggest holding first, so the legend and the line colours line up with what
  // the reader cares about
  const assetKeys = useMemo(() => {
    if (!history || history.points.length === 0) return []
    const last = history.points.at(-1)!.held
    return Object.keys(last).sort((a, b) => (last[b] ?? 0) - (last[a] ?? 0))
  }, [history])

  const series = useMemo<Row[]>(() => {
    if (!history) return []
    return history.points.map((p) => {
      const row: Row = {
        ts: p.ts,
        label: day(p.ts),
        value: valueAtCurrentPrice(p, priceByKey),
      }
      for (const k of assetKeys) row[k] = p.held[k] ?? 0
      return row
    })
  }, [history, priceByKey, assetKeys])

  const recorded = readNavHistory(network, address)
  const { change, drawdown } = computeNavStats(recorded)

  if (!address) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-text">Performance</h2>
        <Card>
          <Empty>Connect a wallet to rebuild its history from the ledger.</Empty>
        </Card>
      </div>
    )
  }

  const first = series[0]
  const last = series.at(-1)
  const netChange = first && last ? last.value - first.value : null

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text">Performance</h2>
        <p className="text-xs text-text-secondary mt-1">
          Rebuilt from every credit, debit and fee this account has paid, so the last point matches
          the live balance exactly.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="Value now"
          value={usdTotal != null ? formatValue(usdTotal, unit) : 'n/a'}
          sub={unit === 'USDC' ? 'quoted in testnet USDC' : undefined}
        />
        <Stat
          label="Net change in holdings"
          value={netChange != null ? `${netChange >= 0 ? '+' : ''}${formatValue(netChange, unit)}` : 'n/a'}
          tone={netChange == null ? 'plain' : netChange >= 0 ? 'up' : 'down'}
          sub="deposits and spending, not market moves"
        />
        <Stat
          label="Market move"
          value={change != null ? `${change >= 0 ? '+' : ''}${change.toFixed(2)}%` : 'n/a'}
          tone={change == null ? 'plain' : change >= 0 ? 'up' : 'down'}
          sub={`${recorded.length} snapshot${recorded.length === 1 ? '' : 's'} recorded here`}
        />
        <Stat
          label="Deepest dip"
          value={drawdown != null ? `${drawdown.toFixed(2)}%` : 'n/a'}
          tone={drawdown != null && drawdown < 0 ? 'down' : 'plain'}
          sub="across recorded snapshots"
        />
      </div>

      <Card>
        <CardHead
          title="Portfolio value over time"
          note={`Every holding valued at today's price, so the shape shows what entered and left the wallet rather than what the market did. ${
            unit === 'USDC' ? 'Quoted in testnet USDC.' : ''
          }`}
          meta={
            <Link to="/activity" className="text-xs text-primary hover:underline">
              See the moves
            </Link>
          }
        />
        {historyQ.isLoading ? (
          <p className="text-xs text-text-muted py-8 text-center">Replaying the ledger...</p>
        ) : historyQ.isError ? (
          <Failed what="Couldn't read this account's history." onRetry={() => historyQ.refetch()} />
        ) : series.length < 2 ? (
          <Empty>Not enough history on {network} yet. One move is enough to start the curve.</Empty>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={series} margin={{ left: 4, right: 8, top: 4 }}>
                <defs>
                  <linearGradient id="valueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
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
                  width={56}
                  tickFormatter={(v) => compactNumber(Number(v))}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(v) => new Date(Number(v)).toLocaleString('en-GB')}
                  formatter={(v) => [formatValue(Number(v), unit), 'Value']}
                />
                <Area
                  type="stepAfter"
                  dataKey="value"
                  stroke={CHART_COLORS[0]}
                  strokeWidth={2}
                  fill="url(#valueFill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
            {!history?.complete && (
              <p className="text-[11px] text-text-muted mt-2">
                This account has more history than one read can cover, so the curve starts partway
                through.
              </p>
            )}
          </>
        )}
      </Card>

      <Card>
        <CardHead
          title="Holdings by asset"
          note="The raw token amounts behind the curve above, with no price applied at all."
        />
        {series.length < 2 ? (
          <Empty>Nothing to plot yet.</Empty>
        ) : (
          // one panel per asset rather than one shared axis: 99,000 LOBS and
          // 6,656 XLM on the same scale flattens the smaller holding into a line
          // along the bottom
          <div className="grid sm:grid-cols-2 gap-4">
            {assetKeys.map((k, i) => (
              <div key={k}>
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-xs font-medium text-text">{keyCode(k)}</span>
                  <span className="text-xs text-text-muted tabular-nums">
                    {formatBalance(String(history?.points.at(-1)?.held[k] ?? 0))}
                  </span>
                </div>
                <ResponsiveContainer width="100%" height={130}>
                  <LineChart data={series} margin={{ left: 0, right: 6, top: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                    <XAxis
                      dataKey="ts"
                      type="number"
                      scale="time"
                      domain={['dataMin', 'dataMax']}
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={44}
                      tickFormatter={day}
                    />
                    <YAxis
                      tick={AXIS_TICK}
                      axisLine={false}
                      tickLine={false}
                      width={48}
                      tickFormatter={(v) => compactNumber(Number(v))}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelFormatter={(v) => new Date(Number(v)).toLocaleString('en-GB')}
                      formatter={(v) => [formatBalance(String(v)), keyCode(k)]}
                    />
                    <Line
                      type="stepAfter"
                      dataKey={k}
                      name={k}
                      stroke={CHART_COLORS[i % CHART_COLORS.length]}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
