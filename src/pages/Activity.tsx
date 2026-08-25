import { useMemo } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { useNetwork } from '../contexts/NetworkContext'
import { useWallet } from '../contexts/WalletContext'
import { useActivity, KIND_LABEL, type ActivityKind } from '../integrations/horizon/activity'
import { CHART_COLORS, CHART_MUTED, TOOLTIP_STYLE, AXIS_TICK } from '../utils/recharts'
import { fetchAllActivity, activityCsv, activityJson, type FullHistory } from '../integrations/horizon/export'
import { exportName } from '../utils/csv'
import ActivityFeed from '../components/ActivityFeed'
import ExportButton, { type ExportFormat } from '../components/ExportButton'
import RoutingFeedCard from '../components/RoutingFeedCard'
import { Card, CardHead, ChartFrame, Disclosure, Empty, Stat } from '../components/ui'
import { InfoTip } from '../components/InfoTip'

// kinds that represent something the owner did, as opposed to the rent and
// read calls a soroban account accumulates on its own
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

  const events = useMemo(() => (q.data?.pages ?? []).flatMap((p) => p.events), [q.data])

  const byKind = useMemo(() => {
    const tally = new Map<ActivityKind, number>()
    for (const e of events) tally.set(e.kind, (tally.get(e.kind) ?? 0) + 1)
    return [...tally.entries()]
      .map(([kind, count]) => ({ kind, label: KIND_LABEL[kind], count }))
      .sort((a, b) => b.count - a.count)
  }, [events])

  // The feed pages as you scroll, so what it holds is a window. The export walks
  // Horizon to the end instead, and says so when the page budget runs out first.
  const read = (report: (m: string) => void) =>
    fetchAllActivity(network, address!, (n) => report(`Read ${n} operations...`))

  const noteFor = (h: FullHistory) =>
    h.complete
      ? `${h.events.length} operations, back to the first one.`
      : `${h.events.length} operations. This account has more history than one export reads.`

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

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-text">Activity</h2>
          <p className="text-xs text-text-secondary mt-1">
            What this wallet has actually done, read live from Stellar and labelled by what each
            transaction did.
          </p>
        </div>
        <ExportButton
          label="Full history"
          name={exportName('activity', { account: address, network })}
          formats={formats}
          disabled={!address}
          hint="Every operation on this account, not only the ones loaded below"
          disabledHint="Connect a wallet first"
        />
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <Stat
          label={
            <>
              Operations read <InfoTip term="operation" label="an operation" />
            </>
          }
          value={String(events.length)}
          sub={oldest ? `back to ${new Date(oldest).toLocaleDateString('en-GB')}` : undefined}
        />
        <Stat
          label="Deliberate actions"
          value={String(deliberate)}
          sub="swaps, transfers, liquidity"
          tone="accent"
        />
        <Stat
          label="Failed"
          value={String(failed)}
          tone={failed > 0 ? 'down' : 'plain'}
          sub={failed === 0 ? 'none so far' : 'check the feed below'}
        />
      </div>

      <Card>
        <CardHead
          title="Breakdown by type"
          note={
            <>
              How this wallet's operations split. Maintenance covers storage rent{' '}
              <InfoTip term="storageRent" label="storage rent" /> and background reads.
            </>
          }
        />
        {byKind.length === 0 ? (
          <Empty>
            {address ? 'Nothing recorded on this account yet.' : 'Connect a wallet to see its history.'}
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

      <Card>
        <Disclosure summary="Routing decisions recorded in this browser">
          <RoutingFeedCard bare />
        </Disclosure>
      </Card>
    </div>
  )
}
