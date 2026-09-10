import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useAccountBalances, useAccountExists } from '../integrations/horizon/account'
import { useXlmPrice, valueBalances, priceUnit, tokenPricer } from '../integrations/pricing/price'
import { buildPortfolio } from '../integrations/pricing/portfolio'
import { useVaultPositions } from '../integrations/lobster/position'
import {
  useBalanceHistory,
  valueAtCurrentPrice,
  assetKey,
  densify,
  type BalancePoint,
} from '../integrations/pricing/history'
import { useRecordNav } from '../integrations/pricing/nav'
import { valueHistoryCsv, performanceJson } from '../integrations/pricing/export'
import { exportName } from '../utils/csv'
import { CONTRACTS } from '../config/contracts'
import { cn, compactNumber, formatBalance, formatValue } from '../utils/format'
import { AXIS_TICK, CHART_COLORS, GRID_STROKE, TOOLTIP_STYLE } from '../utils/recharts'
import ExportButton from '../components/ExportButton'
import LiveDataMeta from '../components/LiveDataMeta'
import { Card, CardHead, ChartFrame, Empty, Failed, Stat } from '../components/ui'
import { InfoTip } from '../components/InfoTip'

const day = (ts: number) =>
  new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

type Range = '7d' | '30d' | '90d' | 'all'
const RANGE_DAYS: Record<Exclude<Range, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90 }

interface Row {
  ts: number
  value: number
}

function FlowRow({
  label,
  amount,
  sign,
  note,
}: {
  label: string
  amount: string
  sign: '+' | '-'
  note?: string
}) {
  const zero = Number(amount) === 0
  return (
    <li className="flex items-center justify-between gap-3 py-2.5">
      <span className="min-w-0">
        <span className="text-text-secondary">{label}</span>
        {note && !zero && <span className="block text-[11px] text-text-muted">{note}</span>}
      </span>
      <span className={`tabular-nums shrink-0 ${zero ? 'text-text-muted' : 'text-text'}`}>
        {zero ? '0.00' : `${sign}${formatBalance(amount)}`} XLM
      </span>
    </li>
  )
}

export default function Performance() {
  const { address } = useWallet()
  const { network } = useNetwork()
  const missing = useAccountExists(network, address) === 'missing'
  const balancesQ = useAccountBalances(network, address)
  const priceQ = useXlmPrice(network)
  const historyQ = useBalanceHistory(network, address)
  const vaultsQ = useVaultPositions(network, address)
  const [range, setRange] = useState<Range>('all')

  const unit = priceUnit(network)
  const price = priceQ.data ?? null
  const { lines, usdTotal } = valueBalances(balancesQ.data ?? [], price, network)
  // the same total Overview leads with: wallet plus vaults, not wallet alone
  const portfolio = buildPortfolio(lines, vaultsQ.data ?? [], tokenPricer(network, price), network)
  const total = usdTotal != null ? portfolio.total : null
  // nothing on this page reads the value series any more, but it stays sampled:
  // a session that only ever lands here would otherwise leave a hole in it
  useRecordNav(network, address, total)

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

  // biggest holding first, so the download opens on the column the reader came for
  const assetKeys = useMemo(() => {
    if (!history || history.points.length === 0) return []
    const last = history.points.at(-1)!.held
    return Object.keys(last).sort((a, b) => (last[b] ?? 0) - (last[a] ?? 0))
  }, [history])

  const toRows = (pts: BalancePoint[]): Row[] =>
    pts.map((p) => ({ ts: p.ts, value: valueAtCurrentPrice(p, priceByKey) }))

  // the chart wants a point everywhere the cursor can land; the table wants only
  // the moments something actually happened
  const series = useMemo(
    () => (history ? toRows(densify(history.points)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, priceByKey],
  )
  const changes = useMemo(
    () => (history ? toRows(history.points) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [history, priceByKey],
  )

  const flows = history?.flows

  // narrow the curve to a recent window; carry the running value to the window's
  // left edge so it starts at the right height instead of mid-air. the table just
  // lists the real moves inside the window, no synthetic anchor.
  const cutoffMs = range === 'all' ? null : Date.now() - RANGE_DAYS[range] * 86_400_000
  const viewSeries: Row[] =
    cutoffMs == null
      ? series
      : (() => {
          const before = series.filter((r) => r.ts < cutoffMs).at(-1)
          const inWin = series.filter((r) => r.ts >= cutoffMs)
          return before ? [{ ts: cutoffMs, value: before.value }, ...inWin] : inWin
        })()
  const viewChanges = cutoffMs == null ? changes : changes.filter((r) => r.ts >= cutoffMs)

  if (!address) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-text">Performance</h2>
        <Card>
          <Empty>Connect a wallet to rebuild its history from on-chain data.</Empty>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-text">Performance</h2>
          <p className="text-xs text-text-secondary mt-1">
            Rebuilt from every credit, debit and fee this account has paid, so the last point
            matches the live balance exactly.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
        <LiveDataMeta
          dataUpdatedAt={historyQ.dataUpdatedAt}
          isFetching={historyQ.isFetching || balancesQ.isFetching || priceQ.isFetching || vaultsQ.isFetching}
          onRefresh={() => { historyQ.refetch(); balancesQ.refetch(); priceQ.refetch(); vaultsQ.refetch() }}
        />
        <ExportButton
          label="Value history"
          name={exportName('value-history', { account: address, network })}
          hint="One row per moment a balance moved, plus the XLM reconciliation in the JSON"
          disabled={!history || history.points.length === 0}
          disabledHint="No history rebuilt yet"
          formats={[
            {
              label: 'CSV',
              ext: 'csv',
              mime: 'text/csv',
              build: async () => ({
                text: valueHistoryCsv(history!.points, assetKeys, priceByKey, unit),
                note: `${history!.points.length} moves${history!.complete ? '' : ', clipped at the oldest page read'}.`,
              }),
            },
            {
              label: 'JSON',
              ext: 'json',
              mime: 'application/json',
              build: async () => ({
                text: performanceJson({
                  account: address,
                  network,
                  unit,
                  points: history!.points,
                  priceByKey,
                  flows: history!.flows,
                  complete: history!.complete,
                }),
                note: `${history!.points.length} moves, with the XLM reconciliation.`,
              }),
            },
          ]}
        />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Value now"
          value={total != null ? formatValue(total, unit) : 'n/a'}
          sub={`wallet plus vaults${unit === 'USDC' ? ', in testnet USDC' : ''}`}
        />
        <Stat
          label="Spent on the network"
          value={
            flows ? `${formatBalance(String(Number(flows.storageRent) + Number(flows.txFees)))} XLM` : 'n/a'
          }
          sub={
            flows && Number(flows.storageRent) > 0 ? (
              <>
                {formatBalance(flows.storageRent)} of it is prepaid storage rent{' '}
                <InfoTip term="storageRent" label="storage rent" />
              </>
            ) : (
              'transaction fees'
            )
          }
        />
      </div>

      <Card>
        <CardHead
          title="Wallet balance over time"
          note={`What the wallet itself held, rebuilt from its on-chain history and valued at today's price. A swap or a vault deposit leaves this line even though the value did not leave you, which is what the breakdown below accounts for.${
            unit === 'USDC' ? ' Quoted in testnet USDC.' : ''
          }`}
          meta={
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-bg rounded-full p-0.5 text-[11px]">
                {(['7d', '30d', '90d', 'all'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRange(r)}
                    className={cn(
                      'px-2 py-0.5 rounded-full font-medium transition-colors',
                      range === r ? 'bg-bg-card text-primary shadow-sm' : 'text-text-muted',
                    )}
                  >
                    {r === 'all' ? 'All' : r}
                  </button>
                ))}
              </div>
              <Link to="/activity" className="text-xs text-primary hover:underline">
                See the moves
              </Link>
            </div>
          }
        />
        {historyQ.isLoading ? (
          <p className="text-xs text-text-muted py-8 text-center">Rebuilding history...</p>
        ) : historyQ.isError ? (
          <Failed what="Couldn't read this account's history." onRetry={() => historyQ.refetch()} />
        ) : series.length < 2 ? (
          <Empty>
            {missing
              ? `No history to plot until this wallet is funded on ${network}.`
              : `Not enough history on ${network} yet. One move is enough to start the curve.`}
          </Empty>
        ) : viewSeries.length < 2 ? (
          <Empty>No balance change in this window. Pick a wider range.</Empty>
        ) : (
          <>
            <ChartFrame
              label={`Wallet balance over time, quoted in ${unit}`}
              columns={['Date', `Value (${unit})`]}
              rows={viewChanges.map((r) => [
                new Date(r.ts).toLocaleString('en-GB'),
                formatValue(r.value, unit),
              ])}
            >
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={viewSeries} margin={{ left: 4, right: 8, top: 4 }}>
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
            </ChartFrame>
            {!history?.complete && (
              <p className="text-[11px] text-text-muted mt-2">
                This account has more history than one read can cover, so the curve starts partway
                through.
              </p>
            )}
          </>
        )}
      </Card>

      {flows && history && history.points.length > 0 && (
        <Card>
          <CardHead
            title="Where the XLM went"
            note={
              <>
                Every stroop <InfoTip term="stroop" label="a stroop" /> this account has ever
                received, accounted for. The lines add up to the balance on-chain right now.
              </>
            }
          />
          <ul className="divide-y divide-border text-sm">
            <FlowRow label="Received from outside" amount={flows.receivedOutside} sign="+" />
            <FlowRow label="Sent to someone else" amount={flows.sentOutside} sign="-" />
            <FlowRow
              label="Moved into swaps and vaults"
              amount={flows.intoContracts}
              sign="-"
              note="converted or parked, not spent"
            />
            <FlowRow label="Returned by a contract" amount={flows.fromContracts} sign="+" />
            <FlowRow
              label="Prepaid storage rent"
              amount={flows.storageRent}
              sign="-"
              note="one-off, buys months of contract storage"
            />
            <FlowRow
              label="Transaction fees"
              amount={flows.txFees}
              sign="-"
              note="the per-transaction cost"
            />
            <li className="flex items-center justify-between gap-3 py-2.5 font-medium">
              <span className="text-text">Held in the wallet now</span>
              <span className="text-text tabular-nums">{formatBalance(flows.heldNow)} XLM</span>
            </li>
          </ul>
          <p className="text-xs text-text-secondary mt-3">
            {flows.reconciles
              ? 'These figures match the live balance to the stroop.'
              : 'This account has more history than one read covers, so the lines below do not close.'}
          </p>
        </Card>
      )}
    </div>
  )
}
