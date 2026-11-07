import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { BASE } from './fixtures'

// prod gets these headers from the VM's Caddy site file. `vite preview` does not apply it,
// so a local run only checks what the file declares
const isLocal = /localhost|127\.0\.0\.1/.test(BASE)

function declared(name: string): string | undefined {
  const site = readFileSync(resolve(process.cwd(), 'scripts/vm/stellar-instit.caddy'), 'utf8')
  // the site-level block, one tab in, not a header line nested in a handle
  const block = /^\theader \{([^}]*)\}/m.exec(site)?.[1] ?? ''
  for (const line of block.split('\n')) {
    const m = /^\s*([A-Za-z-]+)\s+"([^"]*)"/.exec(line)
    if (m && m[1].toLowerCase() === name) return m[2]
  }
  return undefined
}

test.describe('HTTP security headers (VM site config)', () => {
  test('HSTS max-age is at least a year', async ({ request }) => {
    const configured = declared('strict-transport-security')
    expect(configured, 'the Caddy site file must declare Strict-Transport-Security').toBeTruthy()
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

  test('X-Frame-Options is DENY', async ({ request }) => {
    expect(declared('x-frame-options')).toBe('DENY')

    if (isLocal) return
    expect((await request.get(BASE)).headers()['x-frame-options']).toBe('DENY')
  })

  test('X-Content-Type-Options is nosniff', async ({ request }) => {
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
