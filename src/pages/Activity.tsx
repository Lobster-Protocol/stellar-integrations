import { useMemo, useState } from 'react'
import { generateActivity, getProtocolColor, getProtocolLabel, formatUSD, type ActivityType } from '../data/mock'
import { cn } from '../utils/format'

const TYPE_LABELS: Record<ActivityType, string> = {
  migration: 'Pool Migration',
  swap: 'Arbitrage Swap',
  deposit: 'Deposit',
  withdraw: 'Withdrawal',
  bridge_in: 'Bridge In',
  bridge_out: 'Bridge Out',
}

const TYPE_COLORS: Record<ActivityType, string> = {
  migration: '#3693fb',
  swap: '#ff8770',
  deposit: '#10b981',
  withdraw: '#ef4444',
  bridge_in: '#9333ea',
  bridge_out: '#f97316',
}

type Filter = 'all' | ActivityType

// TODO: pagination for long activity feeds
export default function Activity() {
  const events = useMemo(() => generateActivity(), [])
  const [filter, setFilter] = useState<Filter>('all')

  const filtered = filter === 'all' ? events : events.filter(e => e.type === filter)

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-text">Strategy Activity</h2>
        <div className="flex flex-wrap gap-1.5">
          {(['all', 'migration', 'swap', 'deposit', 'bridge_in'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-all',
                filter === f ? 'bg-primary text-white' : 'bg-bg text-text-secondary hover:text-text'
              )}
            >
              {f === 'all' ? 'All' : TYPE_LABELS[f as ActivityType]}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-bg-card rounded-3xl overflow-hidden" style={{ border: '1px solid rgba(13, 45, 76, 0.08)', boxShadow: '0 12px 35px rgba(8, 10, 12, 0.08)' }}>
        <div className="divide-y" style={{ borderColor: 'rgba(13, 45, 76, 0.06)' }}>
          {filtered.map(event => (
            <div key={event.id} className="px-5 py-4 hover:bg-bg/30 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span
                    className="mt-0.5 w-2 h-2 rounded-full shrink-0"
                    style={{ background: TYPE_COLORS[event.type] }}
                  />
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-text">{TYPE_LABELS[event.type]}</span>
                      {event.type === 'migration' && event.fromProtocol && event.toProtocol && (
                        <span className="text-xs text-text-muted">
                          <span style={{ color: getProtocolColor(event.fromProtocol) }}>{getProtocolLabel(event.fromProtocol)}</span>
                          {' → '}
                          <span style={{ color: getProtocolColor(event.toProtocol) }}>{getProtocolLabel(event.toProtocol)}</span>
                        </span>
                      )}
                      {event.amount && (
                        <span className="text-xs text-text-secondary font-mono">
                          {event.type === 'swap' ? `${event.amount.toLocaleString()} ${event.token}` : formatUSD(event.amount)}
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
