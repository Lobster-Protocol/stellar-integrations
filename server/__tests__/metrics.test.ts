// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest'
import { Hono } from 'hono'

import { normalizeRoute, registry } from '../metrics/registry'
import { metricsTiming, mountMetrics } from '../metrics/http'

describe('normalizeRoute', () => {
  it('keeps known routes and drops the query + trailing slash', () => {
    expect(normalizeRoute('/dfns/sign')).toBe('/dfns/sign')
    expect(normalizeRoute('/health?x=1')).toBe('/health')
    expect(normalizeRoute('/ttl/')).toBe('/ttl')
  })

  it('collapses id segments to a template', () => {
    expect(normalizeRoute('/dfns/sign/tx-123/status')).toBe('/dfns/sign/:id/status')
    expect(normalizeRoute('/dfns/approvals/ap-9/decision')).toBe('/dfns/approvals/:id/decision')
  })

  it('maps anything unrecognized to other', () => {
    expect(normalizeRoute('/wp-admin')).toBe('other')
    expect(normalizeRoute('/dfns/sign/anything/else/here')).toBe('other')
  })
})

describe('metrics endpoint', () => {
  const OLD = process.env.METRICS_TOKEN
  afterEach(() => {
    if (OLD === undefined) delete process.env.METRICS_TOKEN
    else process.env.METRICS_TOKEN = OLD
  })

  function appWith() {
    const root = new Hono()
    root.use('*', metricsTiming())
    mountMetrics(root)
    root.get('/health', (c) => c.text('ok'))
    return root
  }

  it('404s when no token is set', async () => {
    delete process.env.METRICS_TOKEN
    const res = await appWith().request('/metrics')
    expect(res.status).toBe(404)
  })

  it('401s without the token and serves metrics with it', async () => {
    process.env.METRICS_TOKEN = 'secret-metrics-token'
    const app = appWith()
    expect((await app.request('/metrics')).status).toBe(401)
    const ok = await app.request('/metrics', {
      headers: { authorization: 'Bearer secret-metrics-token' },
    })
    expect(ok.status).toBe(200)
    expect(await ok.text()).toContain('http_request_duration_seconds')
  })

  it('rejects a wrong token', async () => {
    process.env.METRICS_TOKEN = 'secret-metrics-token'
    const res = await appWith().request('/metrics', {
      headers: { 'x-metrics-token': 'nope' },
    })
    expect(res.status).toBe(401)
  })

  it('observes a request without changing the response', async () => {
    process.env.METRICS_TOKEN = 'secret-metrics-token'
    const app = appWith()
    const res = await app.request('/health')
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('ok')
    expect(await registry.metrics()).toMatch(
      /http_request_duration_seconds_count\{[^}]*route="\/health"/,
    )
  })

  it('times a route on a mounted sub-app', async () => {
    // same shape as index.ts: timing on the root, the app mounted after it
    process.env.METRICS_TOKEN = 'secret-metrics-token'
    const sub = new Hono()
    sub.get('/ttl', (c) => c.text('ttl'))
    const root = new Hono()
    root.use('*', metricsTiming())
    mountMetrics(root)
    root.route('/', sub)
    expect((await root.request('/ttl')).status).toBe(200)
    expect(await registry.metrics()).toMatch(
      /http_request_duration_seconds_count\{[^}]*route="\/ttl"/,
    )
  })
})
