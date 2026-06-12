// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'

vi.hoisted(() => {
  process.env.DFNS_WEBHOOK_SECRET = 'test-secret-32chars-or-more-long'
  process.env.DASHBOARD_ORIGIN = 'http://localhost:5173'
})

import { app } from '../webhook'

const TOKEN = 'lobster-test-token-LONG-AND-STRONG-2026'

afterEach(() => {
  delete process.env.LOBSTER_API_TOKEN
})

describe('tokenGuard on /dfns/policies and /dfns/wallets', () => {
  it('lets requests through when LOBSTER_API_TOKEN is unset (local dev)', async () => {
    delete process.env.LOBSTER_API_TOKEN
    const res = await app.fetch(new Request('http://localhost/dfns/policies'))
    // 502 because dfns client is not configured in tests, but NOT a 401
    expect(res.status).not.toBe(401)
  })

  it('rejects requests with no token when LOBSTER_API_TOKEN is set', async () => {
    process.env.LOBSTER_API_TOKEN = TOKEN
    const res = await app.fetch(new Request('http://localhost/dfns/policies'))
    expect(res.status).toBe(401)
  })

  it('accepts a valid bearer authorization header', async () => {
    process.env.LOBSTER_API_TOKEN = TOKEN
    const res = await app.fetch(
      new Request('http://localhost/dfns/policies', {
        headers: { authorization: `Bearer ${TOKEN}` },
      }),
    )
    expect(res.status).not.toBe(401)
  })

  it('accepts a valid x-lobster-token header', async () => {
    process.env.LOBSTER_API_TOKEN = TOKEN
    const res = await app.fetch(
      new Request('http://localhost/dfns/wallets', {
        headers: { 'x-lobster-token': TOKEN },
      }),
    )
    expect(res.status).not.toBe(401)
  })

  it('accepts a valid ?token= query parameter (eventsource path)', async () => {
    process.env.LOBSTER_API_TOKEN = TOKEN
    const res = await app.fetch(
      new Request(`http://localhost/dfns/policies?token=${encodeURIComponent(TOKEN)}`),
    )
    expect(res.status).not.toBe(401)
  })

  it('rejects a token of the right length but wrong content (timing-safe)', async () => {
    process.env.LOBSTER_API_TOKEN = TOKEN
    const wrong = TOKEN.slice(0, -1) + (TOKEN.endsWith('6') ? '7' : '6')
    const res = await app.fetch(
      new Request('http://localhost/dfns/policies', {
        headers: { authorization: `Bearer ${wrong}` },
      }),
    )
    expect(res.status).toBe(401)
  })

  it('rejects a token of the wrong length', async () => {
    process.env.LOBSTER_API_TOKEN = TOKEN
    const res = await app.fetch(
      new Request('http://localhost/dfns/policies', {
        headers: { authorization: 'Bearer short' },
      }),
    )
    expect(res.status).toBe(401)
  })
})

describe('tokenGuard does not gate health or webhook ingestion', () => {
  it('keeps /health public even when LOBSTER_API_TOKEN is set', async () => {
    process.env.LOBSTER_API_TOKEN = TOKEN
    const res = await app.fetch(new Request('http://localhost/health'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string }
    expect(body.status).toBe('ok')
  })

  it('keeps /webhooks/dfns gated by HMAC rather than the token guard', async () => {
    process.env.LOBSTER_API_TOKEN = TOKEN
    // no signature header so the HMAC path returns 401, not the token guard
    const res = await app.fetch(
      new Request('http://localhost/webhooks/dfns', { method: 'POST', body: '{}' }),
    )
    expect(res.status).toBe(401)
  })
})
