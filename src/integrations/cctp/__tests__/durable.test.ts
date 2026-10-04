import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// just what durable.ts uses of IndexedDB, in memory; answers come back on a later tick
function fakeIndexedDB() {
  const notes = new Map<string, unknown>()
  const durability: Array<string | undefined> = []
  const later = (fn: () => void) => setTimeout(fn, 0)
  const db = {
    createObjectStore: () => undefined,
    transaction: (_store: string, _mode: string, opts?: { durability?: string }) => {
      durability.push(opts?.durability)
      const tx: Record<string, unknown> = {}
      tx.objectStore = () => ({
        put: (value: unknown, key: string) => {
          notes.set(key, structuredClone(value))
          later(() => (tx.oncomplete as () => void)?.())
        },
        get: (key: string) => {
          const req: Record<string, unknown> = {}
          later(() => {
            req.result = notes.get(key)
            ;(req.onsuccess as () => void)?.()
          })
          return req
        },
      })
      return tx
    },
  }
  const factory = {
    open: () => {
      const req: Record<string, unknown> = { result: db }
      later(() => {
        ;(req.onupgradeneeded as () => void)?.()
        ;(req.onsuccess as () => void)?.()
      })
      return req
    },
  }
  return { factory, notes, durability }
}

// Cache Storage, in memory
function fakeCaches() {
  const entries = new Map<string, string>()
  const api = {
    open: async () => ({
      put: async (url: string, res: Response) => void entries.set(url, await res.text()),
      match: async (url: string) => (entries.has(url) ? new Response(entries.get(url)) : undefined),
    }),
  }
  return { api, entries }
}

let idb: ReturnType<typeof fakeIndexedDB>
let cache: ReturnType<typeof fakeCaches>

beforeEach(() => {
  localStorage.clear()
  vi.resetModules()
  idb = fakeIndexedDB()
  cache = fakeCaches()
  vi.stubGlobal('indexedDB', idb.factory)
  vi.stubGlobal('caches', cache.api)
})
afterEach(() => vi.unstubAllGlobals())

const K = 'lob_cctp_intents_testnet'

describe('the copy on disk of the bridge notes', () => {
  it('stamps each write with a time that only goes up, and keeps the copy with strict durability', async () => {
    const { writeLocal, writeDurable, writtenAt } = await import('../durable')
    const first = writeLocal(K, '["a"]')
    const second = writeLocal(K, '["b"]')
    expect(second).toBeGreaterThan(first)
    expect(writtenAt(K)).toBe(second)
    await writeDurable(K, '["b"]', second)
    expect(idb.notes.get(K)).toEqual({ value: '["b"]', written: second })
    expect(idb.durability).toContain('strict')
  })

  it('puts back what a power cut kept on disk and not in localStorage', async () => {
    const { restoreNotes } = await import('../durable')
    localStorage.setItem(K, '[]')
    localStorage.setItem(`${K}:written`, '100')
    idb.notes.set(K, { value: '["kept"]', written: 200 })
    expect(await restoreNotes([K], { [K]: 100 })).toEqual([K])
    expect(localStorage.getItem(K)).toBe('["kept"]')
    expect(localStorage.getItem(`${K}:written`)).toBe('200')
  })

  it('leaves a note this page already wrote over since it loaded', async () => {
    const { restoreNotes } = await import('../durable')
    localStorage.setItem(K, '["newer"]')
    localStorage.setItem(`${K}:written`, '150')
    idb.notes.set(K, { value: '["kept"]', written: 200 })
    expect(await restoreNotes([K], { [K]: 100 })).toEqual([])
    expect(localStorage.getItem(K)).toBe('["newer"]')
  })

  it('brings an older copy, or a missing one, up to date', async () => {
    const { restoreNotes } = await import('../durable')
    localStorage.setItem(K, '["local"]')
    localStorage.setItem(`${K}:written`, '300')
    idb.notes.set(K, { value: '["old"]', written: 200 })
    await restoreNotes([K], { [K]: 300 })
    await new Promise((r) => setTimeout(r, 5))
    expect(idb.notes.get(K)).toEqual({ value: '["local"]', written: 300 })
  })

  it('keeps the note in Cache Storage too, which brings it back when IndexedDB is lost', async () => {
    const { writeDurable } = await import('../durable')
    await writeDurable(K, '["kept"]', 200)
    expect(JSON.parse([...cache.entries.values()][0])).toEqual({ value: '["kept"]', written: 200 })
    // the power cut took localStorage's write, and IndexedDB with it
    vi.resetModules()
    vi.stubGlobal('indexedDB', undefined)
    const again = await import('../durable')
    expect(await again.restoreNotes([K], {})).toEqual([K])
    expect(localStorage.getItem(K)).toBe('["kept"]')
  })

  it('takes the newest of the two copies, and writes the older one again', async () => {
    const { restoreNotes } = await import('../durable')
    idb.notes.set(K, { value: '["older"]', written: 100 })
    cache.entries.set(`/__lobster-bridge/${encodeURIComponent(K)}`, JSON.stringify({ value: '["newer"]', written: 300 }))
    expect(await restoreNotes([K], {})).toEqual([K])
    expect(localStorage.getItem(K)).toBe('["newer"]')
    await new Promise((r) => setTimeout(r, 5))
    expect(idb.notes.get(K)).toEqual({ value: '["newer"]', written: 300 })
  })

  it('does nothing where there is no IndexedDB nor Cache Storage', async () => {
    vi.stubGlobal('indexedDB', undefined)
    vi.stubGlobal('caches', undefined)
    const { restoreNotes, writeDurable } = await import('../durable')
    localStorage.setItem(K, '["local"]')
    await writeDurable(K, '["x"]', 1)
    expect(await restoreNotes([K], {})).toEqual([])
    expect(localStorage.getItem(K)).toBe('["local"]')
  })

  it('has a burn note on disk by the time saving it resolves, and transfers back after a power cut', async () => {
    const t = await import('../transfers')
    await t.saveIntent({
      id: 'intent-a',
      network: 'testnet',
      chainKey: 'BASE',
      chainName: 'Base Sepolia',
      amount: '5',
      units: '5000000',
      from: '0xDCD592A255323772f9B1EF5db83D2A0CFcF91a37',
      recipient: 'GAMNA2Q6NTZSUBLMEXLTIXYORE7OXJJBMEGIX7T2OXDAKIA7CCKN4RJV',
      finality: 'fast',
      startedAt: 1,
      session: 'x',
    })
    expect(JSON.parse((idb.notes.get(K) as { value: string }).value)[0].id).toBe('intent-a')

    // the power goes: localStorage loses everything, the copy on disk stays
    localStorage.clear()
    idb.notes.set('lob_cctp_transfers_testnet', {
      value: JSON.stringify([{ id: '0xab', network: 'testnet', chainKey: 'BASE', chainName: 'Base Sepolia', sourceDomain: 6, amount: '5', recipient: 'G', finality: 'fast', createdAt: 1, stage: 'burned' }]),
      written: Date.now(),
    })
    vi.resetModules()
    const again = await import('../transfers')
    await again.restoreFromDisk()
    expect(again.listTransfers('testnet').map((x) => x.id)).toEqual(['0xab'])
    expect(again.listIntents('testnet').map((x) => x.id)).toEqual(['intent-a'])
  })
})
