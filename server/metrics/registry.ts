import { Registry, Histogram, Gauge, collectDefaultMetrics } from 'prom-client'

// the relay runs long, so it gets scraped in place rather than pushing to a gateway
// like the probe and ttl-monitor daemons do.
export const registry = new Registry()

// process_* / nodejs_* so the health board can watch the relay process itself.
collectDefaultMetrics({ register: registry })

// named and labelled to match the p99 and 5xx alerts. route is a fixed template,
// never a raw path, so the label set stays small.
export const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'relay request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
})

// every treasury signature is held for approval, so approvals by status track the
// signing flow. refreshed by dfns-signing.ts.
export const dfnsApprovals = new Gauge({
  name: 'lobster_dfns_approvals',
  help: 'DFNS policy approvals by status',
  labelNames: ['status'],
  registers: [registry],
})

const KNOWN_ROUTES = new Set([
  '/health', '/ttl', '/dfns/wallets', '/dfns/policies', '/dfns/approvals',
  '/dfns/sign', '/dfns/audit/export', '/webhooks/dfns', '/sse', '/metrics',
  '/allbridge/tokens', '/allbridge/quote', '/allbridge/status',
  '/allbridge/raw/approve', '/allbridge/raw/send',
])

// ids are stripped so a per-id path can't blow up the label set; anything unknown
// ends up as "other".
export function normalizeRoute(path: string): string {
  const p = (path.split('?')[0] || '/').replace(/\/+$/, '') || '/'
  if (KNOWN_ROUTES.has(p)) return p
  if (/^\/dfns\/approvals\/[^/]+\/decision$/.test(p)) return '/dfns/approvals/:id/decision'
  if (/^\/dfns\/sign\/[^/]+\/status$/.test(p)) return '/dfns/sign/:id/status'
  return 'other'
}
