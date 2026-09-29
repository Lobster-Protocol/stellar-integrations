import type { Network } from '../../config/contracts'

// the factory cannot unregister a pool and a vault cannot close itself, so a
// wallet's vaults stay listed for good. hiding one only touches this browser.
const KEY = 'lob_hidden_vaults_v1'

type Store = Record<string, string[]>

function scope(network: Network, account: string): string {
  return `${network}:${account}`
}

function read(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const out: Store = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === 'string')
    }
    return out
  } catch {
    // a browser with storage switched off, or a value another tool wrote
    return {}
  }
}

function write(store: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(store))
  } catch {
    // nothing to do; the list simply stays as it was for this session
  }
}

export function hiddenVaults(network: Network, account: string): string[] {
  return read()[scope(network, account)] ?? []
}

export function hideVault(network: Network, account: string, vault: string) {
  hideVaults(network, account, [vault])
}

export function hideVaults(network: Network, account: string, vaults: string[]) {
  if (vaults.length === 0) return
  const store = read()
  const key = scope(network, account)
  store[key] = [...new Set([...(store[key] ?? []), ...vaults])]
  write(store)
}

export function showAllVaults(network: Network, account: string) {
  const store = read()
  delete store[scope(network, account)]
  write(store)
}

// Splits a list into what to render and what the reader chose to put away, so
// the page can always say how many are hidden rather than silently dropping them.
export function partitionHidden<T>(
  items: T[],
  hidden: string[],
  key: (item: T) => string,
): { visible: T[]; hidden: T[] } {
  const set = new Set(hidden)
  return {
    visible: items.filter((i) => !set.has(key(i))),
    hidden: items.filter((i) => set.has(key(i))),
  }
}
