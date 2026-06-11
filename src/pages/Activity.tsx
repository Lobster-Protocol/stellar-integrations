import { useEffect, useMemo, useState } from 'react'
import {
  generateActivity,
  getProtocolColor,
  getProtocolLabel,
  ACTIVITY_LABELS,
  ACTIVITY_COLORS,
  type ActivityEvent,
  type ActivityType,
} from '../data/mock'
import { cn, formatActivityAmount } from '../utils/format'
import OnChainActivityCard from '../components/OnChainActivityCard'
import MockDataBadge from '../components/MockDataBadge'
import RoutingFeedCard from '../components/RoutingFeedCard'
import { readLiveActivity, type LiveActivityEntry } from '../integrations/broker/routing-log'

type Filter = 'all' | ActivityType

const mockEvents = generateActivity()

function liveToActivityEvent(e: LiveActivityEntry): ActivityEvent {
  return {
    id: e.id,
    date: e.date,
    type: e.type,
    txHash: e.txHash,
    via: e.via,
    signer: e.signer,
    soldAsset: e.soldAsset,
    boughtAsset: e.boughtAsset,
    soldAmount: e.soldAmount,
    boughtAmount: e.boughtAmount,
  }
}

const FILTER_OPTIONS: Filter[] = [
  'all',
  'migration',
  'swap',
  'swap_routed',
  'sign',
  'deposit',
  'withdraw',
  'bridge_in',
  'bridge_out',
]

export default function Activity() {
  const [filter, setFilter] = useState<Filter>('all')
  const [liveEntries, setLiveEntries] = useState<LiveActivityEntry[]>(() => readLiveActivity())

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'lob_activity_live') setLiveEntries(readLiveActivity())
    }
    window.addEventListener('storage', onStorage)
    const interval = setInterval(() => setLiveEntries(readLiveActivity()), 5_000)
    return () => {
      window.removeEventListener('storage', onStorage)
      clearInterval(interval)
    }
  }, [])

  const events = useMemo<ActivityEvent[]>(
    () => [...liveEntries.map(liveToActivityEvent), ...mockEvents],
    [liveEntries],
  )

  const filtered = filter === 'all' ? events : events.filter((e) => e.type === filter)

  return (
    <div className="space-y-6">
      <RoutingFeedCard />

      <OnChainActivityCard limit={5} />

      <MockDataBadge />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-text">Strategy Activity</h2>
        <div className="flex flex-wrap gap-1.5">
          {FILTER_OPTIONS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-all',
                filter === f ? 'bg-primary text-white' : 'bg-bg text-text-secondary hover:text-text',
              )}
            >
              {f === 'all' ? 'All' : ACTIVITY_LABELS[f as ActivityType]}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-bg-card rounded-3xl overflow-hidden card">
        <div className="divide-y" style={{ borderColor: 'rgba(13, 45, 76, 0.06)' }}>
          {filtered.map((event) => (
            <div key={event.id} className="px-5 py-4 hover:bg-bg/30 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span
                    className="mt-0.5 w-2 h-2 rounded-full shrink-0"
                    style={{ background: ACTIVITY_COLORS[event.type] }}
                  />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-text">{ACTIVITY_LABELS[event.type]}</span>
                      {event.type === 'migration' && event.fromProtocol && event.toProtocol && (
                        <span className="text-xs text-text-muted">
                          <span style={{ color: getProtocolColor(event.fromProtocol) }}>{getProtocolLabel(event.fromProtocol)}</span>
                          {' → '}
                          <span style={{ color: getProtocolColor(event.toProtocol) }}>{getProtocolLabel(event.toProtocol)}</span>
                        </span>
                      )}
                      {event.type === 'swap_routed' && event.via && (
                        <span className="text-xs text-text-muted font-mono">via {event.via}</span>
                      )}
                      {event.type === 'sign' && event.signer && (
                        <span className="text-xs text-text-muted font-mono">{event.signer}</span>
                      )}
                      {event.amount && (
                        <span className="text-xs text-text-secondary font-mono">
                          {formatActivityAmount(event.type, event.amount, event.token)}
                        </span>
                      )}
                      {event.soldAmount && event.boughtAmount && (
                        <span className="text-xs text-text-secondary font-mono">
                          {event.soldAmount} {event.soldAsset?.split('-')[0].toUpperCase()} {' → '}{' '}
                          {event.boughtAmount} {event.boughtAsset?.split('-')[0].toUpperCase()}
                        </span>
                      )}
                    </div>
                    {event.reason && (
                      <p className="text-xs text-text-muted mt-0.5">{event.reason}</p>
                    )}
                    {event.chain && (
                      <p className="text-xs text-text-muted mt-0.5">Chain: {event.chain}</p>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-text-muted">{event.date}</p>
                  <p className="text-[10px] text-text-muted font-mono mt-0.5">{event.txHash}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
