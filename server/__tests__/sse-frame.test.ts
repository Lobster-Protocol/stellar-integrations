// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'

vi.hoisted(() => {
  process.env.DFNS_WEBHOOK_SECRET = 'test-secret-32chars-or-more-long'
  process.env.DASHBOARD_ORIGIN = 'http://localhost:5173'
})

import { buildSseFrame } from '../webhook'
import type { DfnsWebhookEvent } from '../dfns/types'

const FULL_EVENT: DfnsWebhookEvent = {
  id: 'evt-1',
  kind: 'wallet.transaction.confirmed',
  timestampSent: 1717320000,
  date: '2026-06-02T10:00:00Z',
  data: {
    txHash: '6c8a...real-hash',
    signedEnvelopeXdr: 'AAAA....secret-signed-xdr....',
    walletId: 'wa-aaaa-bbbb-cccc',
    walletAddress: 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU',
    amount: '1000000',
    approverUserIds: ['us-1', 'us-2'],
  },
}

describe('buildSseFrame (SSE payload stripping)', () => {
  it('keeps only id, kind, timestampSent in the data field', () => {
    const frame = buildSseFrame(FULL_EVENT)
    const decoded = JSON.parse(frame.data) as Record<string, unknown>
    expect(Object.keys(decoded).sort()).toEqual(['id', 'kind', 'timestampSent'])
    expect(decoded.id).toBe('evt-1')
    expect(decoded.kind).toBe('wallet.transaction.confirmed')
    expect(decoded.timestampSent).toBe(1717320000)
  })

  it('strips the raw data field entirely (no signed envelope leak)', () => {
    const frame = buildSseFrame(FULL_EVENT)
    expect(frame.data).not.toContain('signedEnvelopeXdr')
    expect(frame.data).not.toContain('AAAA....secret-signed-xdr')
    expect(frame.data).not.toContain('approverUserIds')
    expect(frame.data).not.toContain('walletId')
  })

  it('strips the date field (kept server-side only)', () => {
    const frame = buildSseFrame(FULL_EVENT)
    expect(frame.data).not.toContain('2026-06-02T10:00:00Z')
  })

  it('strips the amount field even on a transfer event', () => {
    const transfer: DfnsWebhookEvent = {
      ...FULL_EVENT,
      kind: 'wallet.transfer.confirmed',
      data: { amount: '5000000', txHash: 'abcd', walletAddress: 'GA...' },
    }
    const frame = buildSseFrame(transfer)
    const decoded = JSON.parse(frame.data) as Record<string, unknown>
    expect(decoded).not.toHaveProperty('amount')
    expect(decoded).not.toHaveProperty('txHash')
  })

  it('places the kind in the SSE event field for client routing', () => {
    const frame = buildSseFrame(FULL_EVENT)
    expect(frame.event).toBe('wallet.transaction.confirmed')
  })

  it('keeps the dfns event id as the SSE id (for Last-Event-ID reconnects)', () => {
    const frame = buildSseFrame(FULL_EVENT)
    expect(frame.id).toBe('evt-1')
  })

  it('still produces a valid frame when the source event has no data field', () => {
    const minimal: DfnsWebhookEvent = {
      id: 'evt-min',
      kind: 'wallet.signature.requested',
      timestampSent: 1717320000,
    }
    const frame = buildSseFrame(minimal)
    expect(() => JSON.parse(frame.data)).not.toThrow()
  })
})
