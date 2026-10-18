import type { Network } from '../../src/config/contracts'
import type { ScanResult } from './monitor'

// serve the last scan and refresh it in the background once it's past the window,
// so /ttl only waits on the rpc for the first scan or one that's gone too stale.
// a failed refresh keeps the old scan for another window
export function scanCache(
  scan: (network: Network) => Promise<ScanResult>,
  { windowMs = 60_000, maxAgeMs = 5 * 60_000, now = Date.now } = {},
) {
  const cache = new Map<Network, { at: number; scan: ScanResult }>()
  const refreshing = new Map<Network, Promise<void>>()

  const refresh = (network: Network): Promise<void> => {
    const running = refreshing.get(network)
    if (running) return running
    const run = scan(network)
      .then((fresh) => {
        cache.set(network, { at: now(), scan: fresh })
      })
      .catch((err) => {
        const last = cache.get(network)
        if (!last) throw err
        last.at = now()
      })
      .finally(() => refreshing.delete(network))
    refreshing.set(network, run)
    return run
  }

  return async function read(network: Network): Promise<ScanResult> {
    const last = cache.get(network)
    const age = last ? now() - last.at : Infinity
    if (age >= maxAgeMs) await refresh(network)
    else if (age >= windowMs) void refresh(network).catch(() => {})
    return cache.get(network)!.scan
  }
}
