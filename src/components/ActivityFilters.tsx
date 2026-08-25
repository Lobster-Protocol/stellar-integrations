import { Search } from 'lucide-react'

import { KIND_GROUPS, type KindGroup } from '../integrations/horizon/activity'
import type { ActivityFilterState } from '../integrations/horizon/activity-window'
import { cn } from '../utils/format'

const GROUP_LABEL: Record<KindGroup | 'all', string> = {
  all: 'Everything',
  moves: 'Transfers',
  trading: 'Swaps',
  liquidity: 'Liquidity',
  housekeeping: 'Maintenance',
}

const PRESETS = [
  { id: 7, label: '7 days' },
  { id: 30, label: '30 days' },
  { id: 90, label: '90 days' },
]

function utcDaysAgo(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

export function ActivityFilters({
  filters,
  counts,
}: {
  filters: ActivityFilterState
  counts: Record<string, number>
}) {
  const { group, query, from, to, update } = filters
  const preset = (days: number) => update({ from: utcDaysAgo(days), to: '' })

  return (
    <div className="space-y-2 mb-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {(['all', ...Object.keys(KIND_GROUPS)] as Array<KindGroup | 'all'>).map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => update({ show: g })}
            disabled={g !== 'all' && !counts[g]}
            className={cn(
              'px-2.5 py-1 rounded-full text-xs transition-colors disabled:opacity-30',
              group === g ? 'bg-primary text-white' : 'bg-bg text-text-secondary hover:text-text',
            )}
          >
            {GROUP_LABEL[g]} {counts[g] ?? 0}
          </button>
        ))}

        <div className="relative ml-auto">
          <Search
            size={12}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => update({ q: e.target.value })}
            placeholder="Search asset, address, hash"
            aria-label="Search this account's activity"
            className="w-52 max-w-full pl-7 pr-2.5 py-1 rounded-full bg-bg text-xs text-text placeholder:text-text-muted outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-text-muted">Dates (UTC)</span>
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => preset(p.id)}
            className={cn(
              'px-2.5 py-1 rounded-full transition-colors',
              from === utcDaysAgo(p.id) && !to
                ? 'bg-primary text-white'
                : 'bg-bg text-text-secondary hover:text-text',
            )}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => update({ from: '', to: '' })}
          className={cn(
            'px-2.5 py-1 rounded-full transition-colors',
            !from && !to ? 'bg-primary text-white' : 'bg-bg text-text-secondary hover:text-text',
          )}
        >
          All time
        </button>

        <label className="flex items-center gap-1 text-text-muted ml-1">
          <span className="sr-only">Start date, UTC</span>
          <input
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => update({ from: e.target.value })}
            aria-label="Start date, UTC"
            className="px-2 py-1 rounded-lg bg-bg text-text outline-none focus:ring-1 focus:ring-primary"
          />
        </label>
        <span className="text-text-muted">to</span>
        <label className="flex items-center gap-1 text-text-muted">
          <span className="sr-only">End date, UTC</span>
          <input
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => update({ to: e.target.value })}
            aria-label="End date, UTC"
            className="px-2 py-1 rounded-lg bg-bg text-text outline-none focus:ring-1 focus:ring-primary"
          />
        </label>
      </div>
    </div>
  )
}
