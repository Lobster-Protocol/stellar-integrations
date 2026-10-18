// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

import { scanCache } from '../ttl-monitor/cache'
import type { ScanResult } from '../ttl-monitor/monitor'

const at = (latestLedger: number): ScanResult => ({ latestLedger, statuses: [] })

function clock() {
  let t = 1_000_000
  return { now: () => t, advance: (ms: number) => void (t += ms) }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('scanCache', () => {
  it('scans once, then answers from that scan inside the window', async () => {
    const c = clock()
    const scan = vi.fn(async () => at(1))
    const read = scanCache(scan, { now: c.now })
    expect((await read('mainnet')).latestLedger).toBe(1)
    c.advance(30_000)
    expect((await read('mainnet')).latestLedger).toBe(1)
    expect(scan).toHaveBeenCalledTimes(1)
  })

  it('answers past the window at once and refreshes behind the answer, once', async () => {
    const c = clock()
    const scan = vi.fn(async () => at(1))
    const read = scanCache(scan, { now: c.now })
    await read('mainnet')
    c.advance(90_000)
    let release!: () => void
    scan.mockImplementationOnce(() => new Promise((resolve) => (release = () => resolve(at(2)))))
    expect((await read('mainnet')).latestLedger).toBe(1)
    // a second reader while that refresh runs starts no other scan
    expect((await read('mainnet')).latestLedger).toBe(1)
    expect(scan).toHaveBeenCalledTimes(2)
    release()
    await settle()
    expect((await read('mainnet')).latestLedger).toBe(2)
  })

  it('waits for a fresh scan once the last one is too old to show', async () => {
    const c = clock()
    const scan = vi.fn(async () => at(1))
    const read = scanCache(scan, { now: c.now })
    await read('mainnet')
    c.advance(6 * 60_000)
    scan.mockResolvedValueOnce(at(2))
    expect((await read('mainnet')).latestLedger).toBe(2)
  })

  it('keeps the last good scan when a refresh fails, and waits a full window to try again', async () => {
    const c = clock()
    const scan = vi.fn(async () => at(1))
    const read = scanCache(scan, { now: c.now })
    await read('mainnet')
    c.advance(6 * 60_000)
    scan.mockRejectedValueOnce(new Error('rpc down'))
    expect((await read('mainnet')).latestLedger).toBe(1)
    c.advance(30_000)
    await read('mainnet')
    expect(scan).toHaveBeenCalledTimes(2)
  })

  it('fails while there has never been a scan, and tries again on the next read', async () => {
    const c = clock()
    const scan = vi.fn(async () => at(1))
    scan.mockRejectedValueOnce(new Error('no factory'))
    const read = scanCache(scan, { now: c.now })
    await expect(read('testnet')).rejects.toThrow('no factory')
    expect((await read('testnet')).latestLedger).toBe(1)
  })

  it('keeps each network apart', async () => {
    const c = clock()
    const scan = vi.fn(async (network: string) => at(network === 'mainnet' ? 64 : 5))
    const read = scanCache(scan, { now: c.now })
    expect((await read('mainnet')).latestLedger).toBe(64)
    expect((await read('testnet')).latestLedger).toBe(5)
    expect(scan).toHaveBeenCalledTimes(2)
  })
})
