import { useMemo } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { useNetwork } from '../contexts/NetworkContext'
import { useWallet } from '../contexts/WalletContext'
import { useActivity, KIND_LABEL, type ActivityKind } from '../integrations/horizon/activity'
import { useAccountExists } from '../integrations/horizon/account'
import { CHART_COLORS, CHART_MUTED, TOOLTIP_STYLE, AXIS_TICK } from '../utils/recharts'
import { fetchAllActivity, activityCsv, activityJson, type FullHistory } from '../integrations/horizon/export'
import { exportName } from '../utils/csv'
import ActivityFeed from '../components/ActivityFeed'
import {
  describeWindow,
  inWindow,
  useActivityFilters,
} from '../integrations/horizon/activity-window'
import ExportButton, { type ExportFormat } from '../components/ExportButton'
import LiveDataMeta from '../components/LiveDataMeta'
import RoutingEngineCard from '../components/RoutingEngineCard'
import { Card, CardHead, ChartFrame, Empty, Stat } from '../components/ui'
import { InfoTip } from '../components/InfoTip'

// the moves, trading and liquidity groups, everything but housekeeping
const DELIBERATE: ActivityKind[] = [
  'swap',
  'liquidity-add',
  'liquidity-remove',
  'position-open',
  'sent',
  'received',
  'mint',
  'burn',
]

export default function Activity() {
  const { address } = useWallet()
  const { network } = useNetwork()
  const q = useActivity(network, address)
  // an unfunded wallet must not export a file that claims a confirmed empty history
  const accountExists = useAccountExists(network, address)
  // every figure here counts what the feed shows
  const filters = useActivityFilters()

  const loaded = useMemo(() => (q.data?.pages ?? []).flatMap((p) => p.events), [q.data])
  const events = useMemo(
    () => (filters.reversed ? [] : loaded.filter((e) => inWindow(e, filters))),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- filters is rebuilt each render, the fields read are listed
    [loaded, filters.startMs, filters.endMs, filters.query, filters.vault, filters.reversed],
  )

  const byKind = useMemo(() => {
    const tally = new Map<ActivityKind, number>()
    for (const e of events) tally.set(e.kind, (tally.get(e.kind) ?? 0) + 1)
    return [...tally.entries()]
      .map(([kind, count]) => ({ kind, label: KIND_LABEL[kind], count }))
      .sort((a, b) => b.count - a.count)
  }, [events])

  // the feed holds loaded pages only. the export reads Horizon itself.
  // only the dates scope the file, search and tab don't
  const read = (report: (m: string) => void) =>
    fetchAllActivity(network, address!, {
      since: filters.startMs,
      until: filters.endMs,
      onProgress: (n) => report(`Read ${n} operations...`),
    })

  const noteFor = (h: FullHistory) => {
    if (!h.complete) {
      return `${h.events.length} operations. This account has more history than one export reads.`
    }
    return filters.windowed
      ? `${h.events.length} operations ${describeWindow(filters)}.`
      : `${h.events.length} operations, back to the first one.`
  }

  const exportBase = filters.windowed
    ? `activity-${filters.from || 'start'}-to-${filters.to || 'now'}`
    : 'activity'

  const formats: ExportFormat[] = [
    {
      label: 'CSV',
      ext: 'csv',
      mime: 'text/csv',
      build: async (report) => {
        const h = await read(report)
        return { text: activityCsv(h.events, network), note: noteFor(h) }
      },
    },
    {
      label: 'JSON',
      ext: 'json',
      mime: 'application/json',
      build: async (report) => {
        const h = await read(report)
        return { text: activityJson(h, network, address!), note: noteFor(h) }
      },
    },
  ]

  const deliberate = events.filter((e) => DELIBERATE.includes(e.kind)).length
  const failed = events.filter((e) => !e.ok).length
  const oldest = events.at(-1)?.at
  const windowSub = oldest ? `back to ${new Date(oldest).toLocaleDateString('en-GB')}` : undefined

  // zero only means something for a wallet we read, otherwise a dash and the reason
  const counted = !!address && q.isSuccess
  const noCount = !address
    ? 'no wallet connected'
    : q.isError
      ? 'could not read this account'
      : 'reading this account'

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-text">Activity</h2>
          <p className="text-xs text-text-secondary mt-1">
            What this wallet has done, read live from Stellar and labelled by type.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
        <LiveDataMeta
          dataUpdatedAt={q.dataUpdatedAt}
          isFetching={q.isFetching}
          onRefresh={() => { if (address) q.refetch() }}
        />
        <ExportButton
          label={filters.windowed ? 'Selected dates' : 'Full history'}
          name={exportName(exportBase, { account: address, network })}
          formats={formats}
          disabled={!address || filters.reversed || accountExists !== 'live'}
          hint={
            filters.windowed
              ? `Every operation ${describeWindow(filters)}, read from Horizon rather than from the rows below`
              : 'Every operation on this account, not only the ones loaded below'
          }
          disabledHint={
            filters.reversed
              ? 'The end date is before the start date'
              : !address
                ? 'Connect a wallet first'
                : accountExists === 'missing'
                  ? `This wallet is not on the ${network} ledger yet, so it has no history to export`
                  : 'Still checking this account on Stellar'
          }
        />
        </div>
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Stat
          label={
            <>
              {filters.windowed ? 'Operations in range' : 'Operations read'}{' '}
              <InfoTip term="operation" label="an operation" />
            </>
          }
          value={counted ? String(events.length) : '-'}
          sub={counted ? (filters.windowed ? describeWindow(filters) : windowSub) : noCount}
        />
        <Stat
          label="Deliberate actions"
          value={counted ? String(deliberate) : '-'}
          sub={counted ? 'swaps, transfers, liquidity' : noCount}
          tone={counted ? 'accent' : 'plain'}
        />
        <Stat
          label="Failed"
          value={counted ? String(failed) : '-'}
          tone={counted && failed > 0 ? 'down' : 'plain'}
          sub={
            !counted
              ? noCount
              : failed > 0
                ? 'check the feed below'
                : filters.windowed
                  ? 'none in this range'
                  : 'none so far'
          }
        />
      </div>

      <Card>
        <CardHead
          title="Breakdown by type"
          note={
            <>
              How this wallet's operations split. The muted bars are maintenance: storage rent{' '}
              <InfoTip term="storageRent" label="storage rent" />, reads, trustlines and other contract calls.
            </>
          }
        />
        {byKind.length === 0 ? (
          <Empty>
            {!address
              ? 'Connect a wallet to see its history.'
              : filters.windowed || filters.query
                ? 'Nothing on this account matches what you asked for.'
                : 'Nothing recorded on this account yet.'}
          </Empty>
        ) : (
          <ChartFrame
            label="Count of operations by type"
            columns={['Type', 'Operations']}
            rows={byKind.map((d) => [d.label, d.count])}
          >
          <ResponsiveContainer width="100%" height={Math.max(120, byKind.length * 30)}>
            <BarChart data={byKind} layout="vertical" margin={{ left: 8, right: 24 }}>
              <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="label"
                width={130}
                tick={{ ...AXIS_TICK, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={{ fill: 'rgba(54,147,251,0.06)' }}
                formatter={(v) => [String(v), 'operations']}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={14}>
                {byKind.map((d) => (
                  <Cell
                    key={d.kind}
                    fill={DELIBERATE.includes(d.kind) ? CHART_COLORS[0] : CHART_MUTED}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          </ChartFrame>
        )}
      </Card>

      <ActivityFeed />

      <RoutingEngineCard />
    </div>
  )
}
