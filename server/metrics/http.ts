import { performance } from 'node:perf_hooks'
import { timingSafeEqual } from 'node:crypto'
import type { Context, Hono, MiddlewareHandler } from 'hono'

import { registry, httpDuration, normalizeRoute } from './registry'

// Times every request into the histogram. The observe runs in a finally and is
// wrapped so a metrics failure can never change or break a response, and the scrape
// endpoint itself is not observed (a scraper must not inflate the counts).
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
        // metrics never affect the response
      }
    }
  }
}

function bearer(header: string | undefined): string | undefined {
  if (!header) return undefined
  const m = /^Bearer\s+(.+)$/i.exec(header)
  return m ? m[1] : undefined
}

function tokenOk(provided: string | undefined, expected: string): boolean {
  if (!provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

// GET /metrics is off unless METRICS_TOKEN is set, so a public relay never leaks
// operational metrics by default; when set, it serves only to a caller presenting
// that token, compared in constant time like the webhook HMAC.
export function mountMetrics(app: Hono): void {
  app.get('/metrics', async (c: Context) => {
    const expected = process.env.METRICS_TOKEN
    if (!expected) return c.notFound()
    const provided = bearer(c.req.header('authorization')) ?? c.req.header('x-metrics-token')
    if (!tokenOk(provided, expected)) return c.text('unauthorized', 401)
    c.header('content-type', registry.contentType)
    return c.body(await registry.metrics())
  })
}
