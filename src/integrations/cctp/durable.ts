// chrome can keep a busy page's localStorage writes in memory for minutes, so a power cut
// right after a burn loses the note. each note also goes to IndexedDB (strict durability)
// and Cache Storage, timestamped, in case one gets damaged; newest wins at load

const DB = 'lobster-bridge'
const STORE = 'notes'
const CACHE = 'lobster-bridge'
const WRITTEN = ':written'
// a disk that doesn't answer mustn't hold up a bridge
const MOST_WAIT_MS = 1_500

interface Copy {
  value: string
  written: number
}

let opening: Promise<IDBDatabase | null> | null = null

function db(): Promise<IDBDatabase | null> {
  opening ??= new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return opening
}

export function writtenAt(key: string): number {
  const n = Number(localStorage.getItem(key + WRITTEN))
  return Number.isFinite(n) ? n : 0
}

// localStorage, with the time of the write beside it; later than any write before it, from
// any tab, even if the clock went back
export function writeLocal(key: string, value: string): number {
  const written = Math.max(Date.now(), writtenAt(key) + 1)
  localStorage.setItem(key, value)
  localStorage.setItem(key + WRITTEN, String(written))
  return written
}

function settle<T>(work: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([work, new Promise<T>((r) => setTimeout(() => r(fallback), MOST_WAIT_MS))])
}

const isCopy = (c: unknown): c is Copy =>
  !!c && typeof (c as Copy).value === 'string' && typeof (c as Copy).written === 'number'

function idbWrite(key: string, copy: Copy): Promise<void> {
  return db().then(
    (d) =>
      new Promise<void>((resolve) => {
        if (!d) return resolve()
        try {
          const tx = d.transaction(STORE, 'readwrite', { durability: 'strict' })
          tx.objectStore(STORE).put(copy, key)
          tx.oncomplete = () => resolve()
          tx.onerror = () => resolve()
          tx.onabort = () => resolve()
        } catch {
          resolve()
        }
      }),
  )
}

function idbRead(key: string): Promise<Copy | null> {
  return db().then(
    (d) =>
      new Promise<Copy | null>((resolve) => {
        if (!d) return resolve(null)
        try {
          const req = d.transaction(STORE, 'readonly').objectStore(STORE).get(key)
          req.onsuccess = () => resolve(isCopy(req.result) ? req.result : null)
          req.onerror = () => resolve(null)
        } catch {
          resolve(null)
        }
      }),
  )
}

// a key of our own in the origin's Cache Storage, never fetched from the network
const cacheUrl = (key: string) => `/__lobster-bridge/${encodeURIComponent(key)}`

async function cacheWrite(key: string, copy: Copy): Promise<void> {
  try {
    if (typeof caches === 'undefined') return
    const cache = await caches.open(CACHE)
    await cache.put(cacheUrl(key), new Response(JSON.stringify(copy), { headers: { 'content-type': 'application/json' } }))
  } catch {
    // the other copies still hold it
  }
}

async function cacheRead(key: string): Promise<Copy | null> {
  try {
    if (typeof caches === 'undefined') return null
    const res = await (await caches.open(CACHE)).match(cacheUrl(key))
    if (!res) return null
    const copy: unknown = await res.json()
    return isCopy(copy) ? copy : null
  } catch {
    return null
  }
}

// resolves once both copies are on disk, or once it is clear they cannot be
export function writeDurable(key: string, value: string, written: number): Promise<void> {
  const copy = { value, written }
  return settle(
    Promise.all([idbWrite(key, copy), cacheWrite(key, copy)]).then(() => undefined),
    undefined,
  )
}

// at load a disk copy newer than localStorage's goes back in, unless this page wrote the key
// since; stale or missing copies get rewritten. no timeout, nothing waits on this. returns the
// keys put back
export async function restoreNotes(keys: string[], atLoad: Record<string, number>): Promise<string[]> {
  const haveIdb = (await db()) !== null
  const haveCache = typeof caches !== 'undefined'
  const back: string[] = []
  for (const key of keys) {
    try {
      const [fromIdb, fromCache] = await Promise.all([idbRead(key), cacheRead(key)])
      const copy = [fromIdb, fromCache].reduce<Copy | null>((a, c) => (c && (!a || c.written > a.written) ? c : a), null)
      const written = writtenAt(key)
      const newest = Math.max(written, copy?.written ?? 0)
      const behind = (c: Copy | null, have: boolean) => have && (!c || c.written < newest)
      if (copy && copy.written > written && written === (atLoad[key] ?? 0)) {
        localStorage.setItem(key, copy.value)
        localStorage.setItem(key + WRITTEN, String(copy.written))
        back.push(key)
        if (behind(fromIdb, haveIdb) || behind(fromCache, haveCache)) void writeDurable(key, copy.value, copy.written)
        continue
      }
      const local = localStorage.getItem(key)
      if (local !== null && written >= (copy?.written ?? 0) && (behind(fromIdb, haveIdb) || behind(fromCache, haveCache))) {
        void writeDurable(key, local, written)
      }
    } catch {
      // full or blocked localStorage: skip this note, carry on with the others
    }
  }
  return back
}
