import { useSearchParams } from 'react-router-dom'

import { KIND_GROUPS, matchesQuery, type ActivityEvent, type KindGroup } from './activity'

// Ledger timestamps are UTC and so are the export columns, so a picked day is
// read as a UTC day too. Reading it in local time would put a Paris evening in
// the previous row of a file whose header says UTC.
const DAY = /^\d{4}-\d{2}-\d{2}$/

function longDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

// A picked day is a whole UTC day: the start opens it, the end closes it at the
// last millisecond, so an operation stamped in the evening of the end date is
// inside the window rather than one row past it. The shape check is not enough
// on its own, 2026-13-45 gets through it and parses to NaN, and a NaN bound
// compares false against every timestamp: the window would quietly hold
// everything while the page claimed it was filtering.
function dayMs(day: string, time: string): number | null {
  if (!DAY.test(day)) return null
  const ms = Date.parse(`${day}T${time}Z`)
  return Number.isFinite(ms) ? ms : null
}

export function windowBounds(from: string, to: string) {
  return {
    startMs: dayMs(from, '00:00:00'),
    endMs: dayMs(to, '23:59:59.999'),
  }
}

export interface ActivityFilterState {
  group: KindGroup | 'all'
  query: string
  from: string
  to: string
  startMs: number | null
  endMs: number | null
  // the end day was picked before the start day, so no row can ever match
  reversed: boolean
  windowed: boolean
  update: (next: Partial<Record<'show' | 'q' | 'from' | 'to', string>>) => void
}

export function useActivityFilters(): ActivityFilterState {
  const [params, setParams] = useSearchParams()

  const rawGroup = params.get('show') ?? ''
  const group: KindGroup | 'all' = rawGroup in KIND_GROUPS ? (rawGroup as KindGroup) : 'all'
  const query = params.get('q') ?? ''
  const { startMs, endMs } = windowBounds(params.get('from') ?? '', params.get('to') ?? '')
  // a date the url carried but nothing could parse is no date at all, so the
  // control shows it as empty rather than as a window that does not exist
  const from = startMs == null ? '' : (params.get('from') as string)
  const to = endMs == null ? '' : (params.get('to') as string)

  return {
    group,
    query,
    from,
    to,
    startMs,
    endMs,
    reversed: startMs != null && endMs != null && startMs > endMs,
    windowed: startMs != null || endMs != null,
    update(next) {
      const p = new URLSearchParams(params)
      for (const [k, v] of Object.entries(next)) {
        if (!v || v === 'all') p.delete(k)
        else p.set(k, v)
      }
      setParams(p, { replace: true })
    },
  }
}

// The date window and the search both shrink the set every count is taken from.
// The tab is a browsing choice on top of that, which is why it is not in here.
export function inWindow(e: ActivityEvent, f: ActivityFilterState): boolean {
  const at = Date.parse(e.at)
  if (f.startMs != null && at < f.startMs) return false
  if (f.endMs != null && at > f.endMs) return false
  return matchesQuery(e, f.query)
}

// Names the window in the same words everywhere it is reported, so a tile, a
// download note and a filename can never describe different periods.
export function describeWindow(f: Pick<ActivityFilterState, 'from' | 'to'>): string {
  if (f.from && f.to) return `between ${longDay(f.from)} and ${longDay(f.to)} (UTC)`
  if (f.from) return `since ${longDay(f.from)} (UTC)`
  if (f.to) return `up to ${longDay(f.to)} (UTC)`
  return 'over the whole history'
}

// The feed will not hold more than this many pages on its own. Without a ceiling
// a start date set years back would fire a request per page at Horizon until the
// account ran out, on a single click.
export const MAX_FEED_PAGES = 10

// A start date is a promise that everything after it is on the page, and the
// feed only holds the pages it has read. This decides whether to keep reading,
// so that a count shown under a date filter is the real one rather than the one
// that happened to be loaded, and says when it gave up instead.
export function feedPaging(args: {
  startMs: number | null
  oldestAt: string | null
  hasNextPage: boolean
  pages: number
}): { covering: boolean; capped: boolean; shouldFetch: boolean } {
  const { startMs, oldestAt, hasNextPage, pages } = args
  const short =
    startMs != null && oldestAt != null && hasNextPage && Date.parse(oldestAt) > startMs
  const room = pages < MAX_FEED_PAGES
  return { covering: short && room, capped: short && !room, shouldFetch: short && room }
}
