import { test, expect } from '@playwright/test'

const BASE = 'https://stellar-integrations-blush.vercel.app'

// O — HTTP security headers (5 tests).
// These run via raw HTTP requests, no browser context needed. We fire one
// request per test to keep the assertions self-contained and the failure
// messages crisp.

test.describe('HTTP security headers (Vercel config)', () => {
  test('O1: HSTS header set with max-age ≥ 1 year', async ({ request }) => {
    const r = await request.get(BASE)
    const hsts = r.headers()['strict-transport-security']
    expect(hsts).toBeTruthy()
    const match = /max-age=(\d+)/.exec(hsts || '')
    expect(match).toBeTruthy()
    expect(Number(match![1])).toBeGreaterThanOrEqual(31_536_000)
  })

  test('O2: X-Frame-Options = DENY', async ({ request }) => {
    const r = await request.get(BASE)
    expect(r.headers()['x-frame-options']).toBe('DENY')
  })

  test('O3: X-Content-Type-Options = nosniff', async ({ request }) => {
    const r = await request.get(BASE)
    expect(r.headers()['x-content-type-options']).toBe('nosniff')
  })

  test('O4: Referrer-Policy = strict-origin-when-cross-origin', async ({ request }) => {
    const r = await request.get(BASE)
    expect(r.headers()['referrer-policy']).toBe('strict-origin-when-cross-origin')
  })

  test('O5: Permissions-Policy disables camera/microphone/geolocation/interest-cohort', async ({ request }) => {
    const r = await request.get(BASE)
    const pp = r.headers()['permissions-policy'] || ''
    expect(pp).toContain('camera=()')
    expect(pp).toContain('microphone=()')
    expect(pp).toContain('geolocation=()')
    expect(pp).toContain('interest-cohort=()')
  })
})

test('A1+A2+N4: site is reachable over HTTPS and returns a 2xx with the expected title', async ({ request }) => {
  const r = await request.get(BASE)
  expect(r.status()).toBeGreaterThanOrEqual(200)
  expect(r.status()).toBeLessThan(300)
  const body = await r.text()
  expect(body).toContain('Lobster Protocol')
})
