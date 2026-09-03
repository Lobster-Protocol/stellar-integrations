import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { BASE } from './fixtures'

// These three headers come from vercel.json, and `vite preview` serves dist off
// disk without ever reading that file, so a local run cannot see them on the
// wire. Skipping on localhost meant they were checked by nothing on any run we
// actually make, so each test now checks the rule we ship, every run, and adds
// the live response only when the suite is pointed at a deploy:
//
//   PLAYWRIGHT_BASE_URL=https://stellar-instit.lobster-protocol.com npx playwright test tests/ux-headers.spec.ts
const isLocal = /localhost|127\.0\.0\.1/.test(BASE)

interface VercelConfig {
  headers?: Array<{ source: string; headers: Array<{ key: string; value: string }> }>
}

// what vercel.json tells Vercel to send on every path, by header name
function declared(name: string): string | undefined {
  const cfg = JSON.parse(
    readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8'),
  ) as VercelConfig
  for (const rule of cfg.headers ?? []) {
    if (rule.source !== '/(.*)') continue
    const hit = rule.headers.find((h) => h.key.toLowerCase() === name)
    if (hit) return hit.value
  }
  return undefined
}

test.describe('HTTP security headers (Vercel config)', () => {
  test('HSTS is configured with max-age >= 1 year, and served', async ({ request }) => {
    const configured = declared('strict-transport-security')
    expect(configured, 'vercel.json must declare Strict-Transport-Security').toBeTruthy()
    const declaredAge = /max-age=(\d+)/.exec(configured!)
    expect(declaredAge).toBeTruthy()
    expect(Number(declaredAge![1])).toBeGreaterThanOrEqual(31_536_000)

    if (isLocal) return
    const served = (await request.get(BASE)).headers()['strict-transport-security']
    expect(served).toBeTruthy()
    const servedAge = /max-age=(\d+)/.exec(served!)
    expect(servedAge).toBeTruthy()
    expect(Number(servedAge![1])).toBeGreaterThanOrEqual(31_536_000)
  })

  test('X-Frame-Options is configured DENY, and served', async ({ request }) => {
    expect(declared('x-frame-options')).toBe('DENY')

    if (isLocal) return
    expect((await request.get(BASE)).headers()['x-frame-options']).toBe('DENY')
  })

  test('X-Content-Type-Options is configured nosniff, and served', async ({ request }) => {
    expect(declared('x-content-type-options')).toBe('nosniff')

    if (isLocal) return
    expect((await request.get(BASE)).headers()['x-content-type-options']).toBe('nosniff')
  })
})

test('site is reachable over HTTPS and returns a 2xx with the expected title', async ({ request }) => {
  const r = await request.get(BASE)
  expect(r.status()).toBeGreaterThanOrEqual(200)
  expect(r.status()).toBeLessThan(300)
  const body = await r.text()
  expect(body).toContain('Lobster Protocol')
})
