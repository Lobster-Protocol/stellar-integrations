import type { Network } from '../../src/config/contracts'
import type { ScanResult } from './monitor'

// the last scan per network for an open route. one past the window is served at
// once and refreshed behind the answer, so a reader only waits on the rpc for the
// first scan or after a long quiet spell, when the last one is too old to show.
// a failed refresh keeps the last good scan and waits a full window to try again.
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
