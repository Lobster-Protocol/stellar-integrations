import { FRONTEND_URL } from '../../src/config/contracts'
import { VENDOR_COMPONENTS, VENDOR_STATUS_PAGES, type Vendor, type VendorComponent } from './targets'

export interface VendorReading {
  vendor: Vendor
  component: string
  level: number
}

// ordered by how bad it is, so a board or an alert can threshold on the number.
// a map, so a status string from the page can only ever hit these five keys
const LEVELS = new Map<string, number>([
  ['operational', 0],
  ['under_maintenance', 1],
  ['degraded_performance', 2],
  ['partial_outage', 3],
  ['major_outage', 4],
])

interface PageComponent {
  id: string
  name: string
  status: string
  group_id?: string | null
}

// a component the page no longer lists, or a status it has never used, is left
// out rather than guessed, so the board shows no data instead of a green it
// can't back up
export function readComponents(
  vendor: Vendor,
  payload: { components?: PageComponent[] },
  watched: VendorComponent[] = VENDOR_COMPONENTS,
): VendorReading[] {
  const all = payload.components ?? []
  const names = new Map(all.map((c) => [c.id, c.name]))
  const out: VendorReading[] = []
  for (const w of watched.filter((x) => x.vendor === vendor)) {
    const hit = all.find(
      (c) => c.name === w.name && (!w.group || (!!c.group_id && names.get(c.group_id) === w.group)),
    )
    const level = hit ? LEVELS.get(hit.status) : undefined
    if (level !== undefined) out.push({ vendor, component: w.component, level })
  }
  return out
}

// status pages move slowly and sit behind a cdn, so they are read every five
// minutes and the minute probe pass reuses the last read in between. that cdn
// throttles shared cloud ips now and then: a failed read keeps a vendor's last
// good one for half an hour, as the pages' own stale-if-error does, then lets it
// go so the board shows no data rather than an old green.
const REFRESH_MS = 5 * 60_000
const KEEP_ON_ERROR_MS = 30 * 60_000
const USER_AGENT = `lobster-status-probe (+${FRONTEND_URL})`
let checkedAt = -Infinity
const good = new Map<Vendor, { at: number; readings: VendorReading[] }>()

export async function vendorStatus(now = Date.now()): Promise<VendorReading[]> {
  if (now - checkedAt >= REFRESH_MS) {
    checkedAt = now
    await Promise.all(
      (Object.keys(VENDOR_STATUS_PAGES) as Vendor[]).map(async (v) => {
        try {
          const res = await fetch(`${VENDOR_STATUS_PAGES[v]}/api/v2/components.json`, {
            headers: { 'user-agent': USER_AGENT, accept: 'application/json' },
            signal: AbortSignal.timeout(15_000),
          })
          if (!res.ok) throw new Error(`answered ${res.status}`)
          good.set(v, { at: now, readings: readComponents(v, (await res.json()) as { components?: PageComponent[] }) })
        } catch (err) {
          console.warn(`[probe] ${v} status page read failed:`, err instanceof Error ? err.message : err)
        }
      }),
    )
  }
  return [...good.values()].filter((g) => now - g.at <= KEEP_ON_ERROR_MS).flatMap((g) => g.readings)
}
