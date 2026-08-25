import { describe, it, expect, vi, beforeEach } from 'vitest'

import { fetchAllActivity } from '../export'
import { getHorizonServer } from '../client'

vi.mock('../client', () => ({ getHorizonServer: vi.fn() }))

// Horizon's page ceiling, mirrored from the module under test so the fixtures
// exercise the same boundary the real reader hits.
const PAGE = 200
const DAY = 86_400_000
// records are served newest first, one day apart, so index n is n days old
const NEWEST = Date.UTC(2026, 7, 20)

function record(i: number) {
  return {
    id: `op-${i}`,
    paging_token: String(i),
    created_at: new Date(NEWEST - i * DAY).toISOString(),
    transaction_hash: `tx-${i}`,
    transaction_successful: true,
    type: 'change_trust',
  }
}

function servePages(sizes: number[]) {
  let served = 0
  const cursors: string[] = []
  const builder = {
    forAccount: () => builder,
    order: () => builder,
    limit: () => builder,
    cursor: (c: string) => {
      cursors.push(c)
      return builder
    },
    call: async () => {
      const size = sizes[served] ?? 0
      const base = served * PAGE
      served++
      return { records: Array.from({ length: size }, (_, i) => record(base + i)) }
    },
  }
  vi.mocked(getHorizonServer).mockReturnValue({
    operations: () => builder,
  } as unknown as ReturnType<typeof getHorizonServer>)
  return { cursors, served: () => served }
}

describe('fetchAllActivity', () => {
  beforeEach(() => vi.clearAllMocks())

  it('keeps reading until a page comes back short', async () => {
    const fake = servePages([PAGE, PAGE, 5])
    const h = await fetchAllActivity('testnet', 'GACCOUNT')
    expect(h.events).toHaveLength(PAGE * 2 + 5)
    expect(h.complete).toBe(true)
    expect(fake.served()).toBe(3)
  })

  it('carries the cursor forward instead of re-reading the first page', async () => {
    const fake = servePages([PAGE, 1])
    await fetchAllActivity('testnet', 'GACCOUNT')
    expect(fake.cursors).toEqual([String(PAGE - 1)])
  })

  it('stops at an empty account without calling it a failure', async () => {
    servePages([0])
    const h = await fetchAllActivity('testnet', 'GACCOUNT')
    expect(h.events).toEqual([])
    expect(h.complete).toBe(true)
  })

  it('reports the history as clipped rather than reading forever', async () => {
    servePages(Array.from({ length: 200 }, () => PAGE))
    const h = await fetchAllActivity('testnet', 'GACCOUNT')
    expect(h.complete).toBe(false)
    expect(h.events.length).toBe(PAGE * 100)
  })

  it('reports progress as each page lands', async () => {
    servePages([PAGE, 3])
    const seen: number[] = []
    await fetchAllActivity('testnet', 'GACCOUNT', { onProgress: (n) => seen.push(n) })
    expect(seen).toEqual([PAGE, PAGE + 3])
  })
})

describe('fetchAllActivity over a date window', () => {
  beforeEach(() => vi.clearAllMocks())

  it('stops reading once a page runs past the start date', async () => {
    const fake = servePages([PAGE, PAGE, PAGE])
    const h = await fetchAllActivity('testnet', 'GACCOUNT', { since: NEWEST - 5 * DAY })
    // records 0 to 5 fall inside; the rest of that page already predates it
    expect(h.events).toHaveLength(6)
    expect(fake.served()).toBe(1)
  })

  it('calls a window it read to the end of complete', async () => {
    servePages([PAGE, PAGE])
    const h = await fetchAllActivity('testnet', 'GACCOUNT', { since: NEWEST - 5 * DAY })
    expect(h.complete).toBe(true)
  })

  it('drops what is newer than the end date', async () => {
    servePages([PAGE])
    const h = await fetchAllActivity('testnet', 'GACCOUNT', {
      since: NEWEST - 5 * DAY,
      until: NEWEST - 2 * DAY,
    })
    expect(h.events).toHaveLength(4)
    expect(h.events[0].at).toBe(new Date(NEWEST - 2 * DAY).toISOString())
    expect(h.events.at(-1)!.at).toBe(new Date(NEWEST - 5 * DAY).toISOString())
  })

  it('takes both bounds as inclusive', async () => {
    servePages([PAGE])
    const h = await fetchAllActivity('testnet', 'GACCOUNT', {
      since: NEWEST - 1 * DAY,
      until: NEWEST,
    })
    expect(h.events.map((e) => e.id)).toEqual(['op-0', 'op-1'])
  })

  it('returns nothing rather than everything when the window holds no operation', async () => {
    servePages([PAGE])
    const h = await fetchAllActivity('testnet', 'GACCOUNT', {
      since: NEWEST + 10 * DAY,
      until: NEWEST + 20 * DAY,
    })
    expect(h.events).toEqual([])
    expect(h.complete).toBe(true)
  })
})
