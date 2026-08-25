import { describe, it, expect, vi, beforeEach } from 'vitest'

import { fetchAllActivity } from '../export'
import { getHorizonServer } from '../client'

vi.mock('../client', () => ({ getHorizonServer: vi.fn() }))

// Horizon's page ceiling, mirrored from the module under test so the fixtures
// exercise the same boundary the real reader hits.
const PAGE = 200

function record(i: number) {
  return {
    id: `op-${i}`,
    paging_token: String(i),
    created_at: '2026-08-20T10:00:00Z',
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
    await fetchAllActivity('testnet', 'GACCOUNT', (n) => seen.push(n))
    expect(seen).toEqual([PAGE, PAGE + 3])
  })
})
