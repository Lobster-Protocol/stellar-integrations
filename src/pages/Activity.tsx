import { useMemo } from 'react'
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

import { useNetwork } from '../contexts/NetworkContext'
import { useWallet } from '../contexts/WalletContext'
import { useActivity, KIND_LABEL, type ActivityKind } from '../integrations/horizon/activity'
import { CHART_COLORS, CHART_MUTED, TOOLTIP_STYLE, AXIS_TICK } from '../utils/recharts'
import ActivityFeed from '../components/ActivityFeed'
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

  const deliberate = events.filter((e) => DELIBERATE.includes(e.kind)).length
  const failed = events.filter((e) => !e.ok).length
  const oldest = events.at(-1)?.at

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text">Activity</h2>
        <p className="text-xs text-text-secondary mt-1">
          What this wallet has actually done, read live from Stellar and labelled by what each
          transaction did.
        </p>
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
