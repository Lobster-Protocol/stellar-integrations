import { Registry, Histogram, Gauge, collectDefaultMetrics } from 'prom-client'

// One registry for everything the relay exposes at /metrics. Kept separate from the
// daemon push metrics (server/probe, server/ttl-monitor): the relay is a
// long-running service scraped in place, which is the shape Prometheus wants, not a
// batch job pushed to a gateway.
export const registry = new Registry()

// process_* / nodejs_* so the health board can watch the relay process itself.
collectDefaultMetrics({ register: registry })

// One histogram serves both the p99 and the 5xx-ratio alert rules, which already
// query http_request_duration_seconds_bucket and _count{status_code=~"5.."}, so the
// name and labels match them with no rule change. Buckets are seconds; status_code
// is the numeric code and route is a fixed template (never a raw path or id), so the
// label set stays small.
export const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'relay request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
})

// DFNS approval activity: in our custody model every treasury signature is held for
// approval, so the count of approvals by status is real signing activity. Read-only,
// refreshed by server/metrics/dfns-signing.ts.
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

// Collapse a request path to a bounded route label. Ids are stripped so a per-id
// path cannot explode the label set, and anything unrecognized becomes "other".
export function normalizeRoute(path: string): string {
  const p = (path.split('?')[0] || '/').replace(/\/+$/, '') || '/'
  if (KNOWN_ROUTES.has(p)) return p
  if (/^\/dfns\/approvals\/[^/]+\/decision$/.test(p)) return '/dfns/approvals/:id/decision'
  if (/^\/dfns\/sign\/[^/]+\/status$/.test(p)) return '/dfns/sign/:id/status'
  return 'other'
}
