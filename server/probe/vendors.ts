import { VENDOR_COMPONENTS, VENDOR_STATUS_PAGES, type Vendor, type VendorComponent } from './targets'

export interface VendorReading {
  vendor: Vendor
  component: string
  // 0 operational, 1 maintenance, 2 degraded, 3 partial outage, 4 major outage
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
// minutes and the minute probe pass reuses the last read in between
const REFRESH_MS = 5 * 60_000
let last: { at: number; readings: VendorReading[] } | undefined

export async function vendorStatus(now = Date.now()): Promise<VendorReading[]> {
  if (last && now - last.at < REFRESH_MS) return last.readings
  const vendors = Object.keys(VENDOR_STATUS_PAGES) as Vendor[]
  const settled = await Promise.allSettled(
    vendors.map(async (v) => {
      const res = await fetch(`${VENDOR_STATUS_PAGES[v]}/api/v2/components.json`, {
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) throw new Error(`${v} status page answered ${res.status}`)
      return readComponents(v, (await res.json()) as { components?: PageComponent[] })
    }),
  )
  const readings: VendorReading[] = []
  for (const s of settled) {
    if (s.status === 'fulfilled') readings.push(...s.value)
    else console.warn('[probe] status page read failed', s.reason)
  }
  last = { at: now, readings }
  return readings
}
