// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.hoisted(() => {
  process.env.DFNS_WEBHOOK_SECRET = 'test-secret-32chars-or-more-long'
  process.env.DASHBOARD_ORIGIN = 'http://localhost:5173'
})

import crypto from 'node:crypto'
import { app, bus } from '../webhook'
import { verifyChain } from '../mica-export'

const SECRET = 'test-secret-32chars-or-more-long'

function sign(raw: string): string {
  return crypto.createHmac('sha256', SECRET).update(raw).digest('hex')
}

function makeEventBody(id: string, opts: { kind?: string; timestampSent?: number } = {}): string {
  return JSON.stringify({
    id,
    kind: opts.kind ?? 'wallet.signature.signed',
    timestampSent: opts.timestampSent ?? Math.floor(Date.now() / 1000),
  })
}

async function postWebhook(body: string, sig: string): Promise<Response> {
  return app.fetch(
    new Request('http://localhost/webhooks/dfns', {
      method: 'POST',
      body,
      headers: { 'x-dfns-webhook-signature': sig },
    }),
  )
}

beforeEach(() => {
  bus.removeAllListeners('event')
})

describe('dfns webhook', () => {
  it('accepts a well-signed fresh event and emits on the bus', async () => {
    const body = makeEventBody('e-accept-1')
    const emitted: string[] = []
    bus.on('event', (e: { id: string }) => emitted.push(e.id))
    const res = await postWebhook(body, `sha256=${sign(body)}`)
    expect(res.status).toBe(200)
    expect(emitted).toEqual(['e-accept-1'])
  })

  it('accepts the raw hex header form without the sha256= prefix', async () => {
    const body = makeEventBody('e-bare-hex')
    const res = await postWebhook(body, sign(body))
    expect(res.status).toBe(200)
  })

  it('rejects an event with a tampered signature', async () => {
    const body = makeEventBody('e-bad-sig')
    const orig = sign(body)
    const last = orig.slice(-1)
    const bad = orig.slice(0, -1) + (last === '0' ? '1' : '0')
    const res = await postWebhook(body, `sha256=${bad}`)
    expect(res.status).toBe(401)
  })

  it('rejects an event with no signature header at all', async () => {
    const body = makeEventBody('e-no-sig')
    const res = await app.fetch(
      new Request('http://localhost/webhooks/dfns', { method: 'POST', body }),
    )
    expect(res.status).toBe(401)
  })

  it('rejects an event older than the replay window', async () => {
    const body = makeEventBody('e-stale', { timestampSent: Math.floor(Date.now() / 1000) - 400 })
    const res = await postWebhook(body, `sha256=${sign(body)}`)
    expect(res.status).toBe(401)
  })

  it('rejects an event further than 5 minutes in the future', async () => {
    const body = makeEventBody('e-future', { timestampSent: Math.floor(Date.now() / 1000) + 400 })
    const res = await postWebhook(body, `sha256=${sign(body)}`)
    expect(res.status).toBe(401)
  })

  it('returns 200 on a duplicate but only emits once', async () => {
    const body = makeEventBody('e-dedup-1')
    const sig = `sha256=${sign(body)}`
    const emitted: string[] = []
    bus.on('event', (e: { id: string }) => emitted.push(e.id))
    const r1 = await postWebhook(body, sig)
    const r2 = await postWebhook(body, sig)
    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
    expect(emitted).toEqual(['e-dedup-1'])
  })

  it('rejects a malformed json payload after signature passes', async () => {
    const body = '{ "id": "x", malformed }'
    const res = await postWebhook(body, `sha256=${sign(body)}`)
    expect(res.status).toBe(400)
  })

  it('rejects a payload with an unknown event kind', async () => {
    const body = JSON.stringify({ id: 'e-bad-kind', kind: 'wallet.minted', timestampSent: Math.floor(Date.now() / 1000) })
    const res = await postWebhook(body, `sha256=${sign(body)}`)
    expect(res.status).toBe(400)
  })
})

describe('mica audit export', () => {
  const TOKEN = 'export-token-32-chars-long-2026'

  function txEvent(id: string, txHash: string): string {
    return JSON.stringify({
      id,
      kind: 'wallet.transaction.confirmed',
      timestampSent: Math.floor(Date.now() / 1000),
      data: {
        txHash,
        walletAddress: 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU',
        destination: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        amount: '10',
      },
    })
  }

  it('threads one continuous hash chain across the exported transaction events', async () => {
    process.env.LOBSTER_API_TOKEN = TOKEN
    try {
      for (const [id, hash] of [['tx-a', 'a'.repeat(64)], ['tx-b', 'b'.repeat(64)]] as const) {
        const body = txEvent(id, hash)
        const r = await postWebhook(body, `sha256=${sign(body)}`)
        expect(r.status).toBe(200)
      }
      const res = await app.fetch(
        new Request('http://localhost/dfns/audit/export', {
          headers: { authorization: `Bearer ${TOKEN}` },
        }),
      )
      expect(res.status).toBe(200)
      const { records } = JSON.parse(await res.text()) as {
        records: Parameters<typeof verifyChain>[0]
      }
      expect(records.length).toBeGreaterThanOrEqual(2)
      expect(records[0].prevRecordHash).toBeNull()
      expect(records[1].prevRecordHash).toBe(records[0].recordHash)
      // a single continuous chain end to end, not one reset per tx
      expect(verifyChain(records)).toBe(-1)
    } finally {
      delete process.env.LOBSTER_API_TOKEN
    }
  })
})
