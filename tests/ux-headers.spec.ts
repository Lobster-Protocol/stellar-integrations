import { test, expect } from '@playwright/test'

const BASE = 'https://stellar-instit.lobster-protocol.com'

// Quick HTTP-only header checks. Raw requests, no browser context.

test.describe('HTTP security headers (Vercel config)', () => {
  test('HSTS header set with max-age >= 1 year', async ({ request }) => {
    const r = await request.get(BASE)
    const hsts = r.headers()['strict-transport-security']
    expect(hsts).toBeTruthy()
    const match = /max-age=(\d+)/.exec(hsts || '')
    expect(match).toBeTruthy()
    expect(Number(match![1])).toBeGreaterThanOrEqual(31_536_000)
  })

  test('X-Frame-Options = DENY', async ({ request }) => {
    const r = await request.get(BASE)
    expect(r.headers()['x-frame-options']).toBe('DENY')
  })

  test('X-Content-Type-Options = nosniff', async ({ request }) => {
    const r = await request.get(BASE)
    expect(r.headers()['x-content-type-options']).toBe('nosniff')
  })
})

test('site is reachable over HTTPS and returns a 2xx with the expected title', async ({ request }) => {
  const r = await request.get(BASE)
  expect(r.status()).toBeGreaterThanOrEqual(200)
  expect(r.status()).toBeLessThan(300)
  const body = await r.text()
  expect(body).toContain('Lobster Protocol')
})
