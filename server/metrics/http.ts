import { performance } from 'node:perf_hooks'
import { timingSafeEqual } from 'node:crypto'
import type { Context, Hono, MiddlewareHandler } from 'hono'

import { registry, httpDuration, normalizeRoute } from './registry'

// /metrics itself isn't counted so scrapes don't skew it.
export function metricsTiming(): MiddlewareHandler {
  return async (c, next) => {
    const start = performance.now()
    try {
      await next()
    } finally {
      try {
        const route = normalizeRoute(c.req.path)
        if (route !== '/metrics') {
          httpDuration.observe(
            { method: c.req.method, route, status_code: String(c.res.status) },
            (performance.now() - start) / 1000,
          )
        }
      } catch {
        // never let metrics break a request
      }
    }
  }
}

// off unless METRICS_TOKEN is set, then only for a caller holding it. constant-time
// compare, same as the webhook hmac.
export function mountMetrics(app: Hono): void {
  app.get('/metrics', async (c: Context) => {
    const expected = process.env.METRICS_TOKEN
    if (!expected) return c.notFound()
    const auth = c.req.header('authorization') ?? ''
    const provided = /^Bearer\s+(.+)$/i.exec(auth)?.[1] ?? c.req.header('x-metrics-token')
    const a = Buffer.from(provided ?? '')
    const b = Buffer.from(expected)
    if (!provided || a.length !== b.length || !timingSafeEqual(a, b)) return c.text('unauthorized', 401)
    c.header('content-type', registry.contentType)
    return c.body(await registry.metrics())
  })
}
