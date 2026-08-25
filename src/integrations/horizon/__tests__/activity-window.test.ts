import { describe, it, expect } from 'vitest'

import {
  describeWindow,
  feedPaging,
  inWindow,
  windowBounds,
  MAX_FEED_PAGES,
  type ActivityFilterState,
} from '../activity-window'
import type { ActivityEvent } from '../activity'

function at(iso: string): ActivityEvent {
  return {
    id: '1',
    kind: 'swap',
    at: iso,
    txHash: 'abcd',
    ok: true,
    moves: [{ code: 'USDC', amount: '10', direction: 'in' }],
  }
}

function filters(over: Partial<ActivityFilterState> = {}): ActivityFilterState {
  const from = over.from ?? ''
  const to = over.to ?? ''
  const bounds = windowBounds(from, to)
  return {
    group: 'all',
    query: '',
    from,
    to,
    ...bounds,
    reversed: bounds.startMs != null && bounds.endMs != null && bounds.startMs > bounds.endMs,
    windowed: bounds.startMs != null || bounds.endMs != null,
    update: () => {},
    ...over,
  }
}

describe('windowBounds', () => {
  it('opens the start day and closes the end day', () => {
    const { startMs, endMs } = windowBounds('2026-06-01', '2026-06-30')
    expect(new Date(startMs!).toISOString()).toBe('2026-06-01T00:00:00.000Z')
    expect(new Date(endMs!).toISOString()).toBe('2026-06-30T23:59:59.999Z')
  })

  it('reads a picked day as a UTC day, whatever the machine is set to', () => {
    expect(windowBounds('2026-06-01', '').startMs).toBe(Date.UTC(2026, 5, 1))
  })

  it('ignores anything that is not a plain date', () => {
    expect(windowBounds('yesterday', '2026-13-45')).toEqual({ startMs: null, endMs: null })
  })
})

describe('inWindow', () => {
  it('keeps everything when no date is set', () => {
    expect(inWindow(at('2020-01-01T00:00:00Z'), filters())).toBe(true)
  })

  it('drops an operation older than the start day', () => {
    const f = filters({ from: '2026-06-01' })
    expect(inWindow(at('2026-05-31T23:59:59Z'), f)).toBe(false)
    expect(inWindow(at('2026-06-01T00:00:00Z'), f)).toBe(true)
  })

  it('keeps an operation stamped late on the end day', () => {
    const f = filters({ to: '2026-06-30' })
    expect(inWindow(at('2026-06-30T23:59:00Z'), f)).toBe(true)
    expect(inWindow(at('2026-07-01T00:00:00Z'), f)).toBe(false)
  })

  it('still applies the search inside the window', () => {
    const f = filters({ from: '2026-06-01', to: '2026-06-30', query: 'usdc' })
    expect(inWindow(at('2026-06-15T10:00:00Z'), f)).toBe(true)
    expect(inWindow(at('2026-06-15T10:00:00Z'), { ...f, query: 'phoenix' })).toBe(false)
  })

  it('flags a window whose end comes before its start', () => {
    expect(filters({ from: '2026-06-30', to: '2026-06-01' }).reversed).toBe(true)
    expect(filters({ from: '2026-06-01', to: '2026-06-30' }).reversed).toBe(false)
  })
})

describe('describeWindow', () => {
  it('names the period the same way everywhere it is reported', () => {
    expect(describeWindow({ from: '2026-06-01', to: '2026-06-30' })).toBe(
      'between 1 Jun 2026 and 30 Jun 2026 (UTC)',
    )
    expect(describeWindow({ from: '2026-06-01', to: '' })).toBe('since 1 Jun 2026 (UTC)')
    expect(describeWindow({ from: '', to: '2026-06-30' })).toBe('up to 30 Jun 2026 (UTC)')
    expect(describeWindow({ from: '', to: '' })).toBe('over the whole history')
  })
})

describe('feedPaging', () => {
  const JUNE = Date.UTC(2026, 5, 1)
  const paging = (over: Partial<Parameters<typeof feedPaging>[0]> = {}) =>
    feedPaging({
      startMs: JUNE,
      oldestAt: '2026-08-01T00:00:00Z',
      hasNextPage: true,
      pages: 1,
      ...over,
    })

  it('reads on while the oldest row is still newer than the start date', () => {
    expect(paging()).toEqual({ covering: true, capped: false, shouldFetch: true })
  })

  it('stops once the feed holds a row older than the start date', () => {
    expect(paging({ oldestAt: '2026-05-01T00:00:00Z' })).toEqual({
      covering: false,
      capped: false,
      shouldFetch: false,
    })
  })

  it('stops when Horizon has nothing older left', () => {
    expect(paging({ hasNextPage: false })).toEqual({
      covering: false,
      capped: false,
      shouldFetch: false,
    })
  })

  it('never reads on its own without a start date', () => {
    expect(paging({ startMs: null })).toEqual({
      covering: false,
      capped: false,
      shouldFetch: false,
    })
  })

  it('gives up at the page ceiling rather than walking the whole account', () => {
    expect(paging({ pages: MAX_FEED_PAGES })).toEqual({
      covering: false,
      capped: true,
      shouldFetch: false,
    })
  })

  it('reports the ceiling as reached, not as covered', () => {
    const at = paging({ pages: MAX_FEED_PAGES })
    expect(at.covering).toBe(false)
    expect(at.capped).toBe(true)
  })

  it('does not fire on an account with nothing in it', () => {
    expect(paging({ oldestAt: null }).shouldFetch).toBe(false)
  })
})
