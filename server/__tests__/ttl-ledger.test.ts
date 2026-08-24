import { describe, it, expect } from 'vitest'

import { readTtl, chunk, WARN_LEDGERS, CRIT_LEDGERS } from '../ttl-monitor/ledger'

describe('readTtl', () => {
  const latest = 1_000_000

  it('reports an entry the rpc omits as archived with no runway', () => {
    const r = readTtl(undefined, latest)
    expect(r).toEqual({ remainingLedgers: 0, remainingSeconds: 0, level: 'archived' })
  })

  it('counts an already-expired entry as archived', () => {
    expect(readTtl(latest - 5, latest).level).toBe('archived')
  })

  it('turns remaining ledgers into seconds at 5s a ledger', () => {
    const r = readTtl(latest + 100, latest)
    expect(r.remainingLedgers).toBe(100)
    expect(r.remainingSeconds).toBe(500)
  })

  it('is ok while there is more than two days of runway', () => {
    expect(readTtl(latest + WARN_LEDGERS + 1, latest).level).toBe('ok')
  })

  // the bands are inclusive: landing exactly on the threshold trips it
  it('warns at the two-day band and crits at the one-day band', () => {
    expect(readTtl(latest + WARN_LEDGERS, latest).level).toBe('warn')
    expect(readTtl(latest + CRIT_LEDGERS, latest).level).toBe('crit')
    expect(readTtl(latest + CRIT_LEDGERS + 1, latest).level).toBe('warn')
  })
})

describe('chunk', () => {
  it('keeps each batch under the 200-key getLedgerEntries limit', () => {
    const sizes = chunk(Array.from({ length: 450 }, (_, i) => i)).map((c) => c.length)
    expect(sizes).toEqual([200, 200, 50])
  })

  it('leaves a short list in one batch and an empty one alone', () => {
    expect(chunk([1, 2, 3])).toEqual([[1, 2, 3]])
    expect(chunk([])).toEqual([])
  })

  it('refuses a non-positive size', () => {
    expect(() => chunk([1], 0)).toThrow(/positive/)
  })
})
