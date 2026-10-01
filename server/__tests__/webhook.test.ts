// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.hoisted(() => {
  process.env.DFNS_WEBHOOK_SECRET = 'test-secret-32chars-or-more-long'
  process.env.DASHBOARD_ORIGIN = 'http://localhost:5173'
})

import crypto from 'node:crypto'
import {
  TransactionBuilder,
  Networks,
  Account,
  BASE_FEE,
  Operation,
  Asset,
  type Transaction,
  type FeeBumpTransaction,
} from '@stellar/stellar-sdk'
import { app, bus } from '../webhook'
import { verifyChain, type McaRecord } from '../mica-export'

const SECRET = 'test-secret-32chars-or-more-long'

function sign(raw: string): string {
  return crypto.createHmac('sha256', SECRET).update(raw).digest('hex')
}

function makeEventBody(
  id: string,
  opts: { kind?: string; timestampSent?: number; retryOf?: string; deliveryAttempt?: number } = {},
): string {
  return JSON.stringify({
    id,
    kind: opts.kind ?? 'wallet.signature.signed',
    timestampSent: opts.timestampSent ?? Math.floor(Date.now() / 1000),
    deliveryAttempt: opts.deliveryAttempt,
    retryOf: opts.retryOf,
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

  it('drops a retry of an event it already stored', async () => {
    const emitted: string[] = []
    bus.on('event', (e: { id: string }) => emitted.push(e.id))
    // dfns sends each attempt under a new id, naming the one it repeats in retryOf
    for (const body of [
      makeEventBody('e-retry-1'),
      makeEventBody('e-retry-2', { retryOf: 'e-retry-1', deliveryAttempt: 2 }),
      makeEventBody('e-retry-3', { retryOf: 'e-retry-2', deliveryAttempt: 3 }),
    ]) {
      const res = await postWebhook(body, `sha256=${sign(body)}`)
      expect(res.status).toBe(200)
    }
    expect(emitted).toEqual(['e-retry-1'])
  })

  it('stores a retry once when the first attempt never arrived', async () => {
    const emitted: string[] = []
    bus.on('event', (e: { id: string }) => emitted.push(e.id))
    for (const body of [
      makeEventBody('e-late-2', { retryOf: 'e-late-1', deliveryAttempt: 2 }),
      makeEventBody('e-late-3', { retryOf: 'e-late-1', deliveryAttempt: 3 }),
    ]) {
      const res = await postWebhook(body, `sha256=${sign(body)}`)
      expect(res.status).toBe(200)
    }
    expect(emitted).toEqual(['e-late-2'])
  })

  it('treats an empty retryOf as a first delivery', async () => {
    const emitted: string[] = []
    bus.on('event', (e: { id: string }) => emitted.push(e.id))
    for (const body of [makeEventBody('e-empty-1', { retryOf: '' }), makeEventBody('e-empty-2', { retryOf: '' })]) {
      const res = await postWebhook(body, `sha256=${sign(body)}`)
      expect(res.status).toBe(200)
    }
    expect(emitted).toEqual(['e-empty-1', 'e-empty-2'])
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

describe('mica export of dfns requests', () => {
  const TOKEN = 'export-token-32-chars-long-2026'
  const TREASURY = 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU'
  const OTHER = 'GCWEI7HVEOPEMP7YTULFH5DMGCJCHMEKZHBHTI3R66WMKX276A4W2OPB'
  const PAYEE = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'

  beforeEach(() => {
    process.env.LOBSTER_API_TOKEN = TOKEN
    process.env.DFNS_STELLAR_WALLET_ID = 'wa-treasury'
    process.env.DFNS_TREASURY_ADDRESS = TREASURY
  })

  afterEach(() => {
    delete process.env.LOBSTER_API_TOKEN
    delete process.env.DFNS_STELLAR_WALLET_ID
    delete process.env.DFNS_TREASURY_ADDRESS
  })

  function payment(source: string, amount: string): Transaction {
    return new TransactionBuilder(new Account(source, '1'), { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.payment({ destination: PAYEE, asset: Asset.native(), amount }))
      .setTimeout(60)
      .build()
  }

  // dfns keeps the unsigned envelope as 0x-prefixed hex
  function hex(tx: Transaction | FeeBumpTransaction): string {
    return `0x${tx.toEnvelope().toXDR('hex')}`
  }

  function transactionRequest(walletId: string, transaction: string, txHash: string) {
    return {
      transactionRequest: {
        id: 'tx-1',
        walletId,
        network: 'StellarTestnet',
        requester: { userId: 'us-1' },
        requestBody: { kind: 'Transaction', transaction },
        status: 'Confirmed',
        txHash,
        dateRequested: '2026-09-30T10:00:00.000Z',
      },
    }
  }

  // posts one event and returns the exported records for its tx hash
  async function exported(id: string, kind: string, data: object, txHash: string): Promise<McaRecord[]> {
    const body = JSON.stringify({
      id,
      kind,
      date: '2026-09-30T10:00:05.000Z',
      timestampSent: Math.floor(Date.now() / 1000),
      data,
    })
    expect((await postWebhook(body, `sha256=${sign(body)}`)).status).toBe(200)
    const res = await app.fetch(
      new Request('http://localhost/dfns/audit/export', {
        headers: { authorization: `Bearer ${TOKEN}` },
      }),
    )
    expect(res.status).toBe(200)
    const { records } = JSON.parse(await res.text()) as { records: McaRecord[] }
    return records.filter((r) => r.transactionReference === txHash)
  }

  it('reads a native transfer from the transfer request', async () => {
    const txHash = 'c'.repeat(64)
    const records = await exported(
      'wh-xfr-1',
      'wallet.transfer.confirmed',
      {
        transferRequest: {
          id: 'xfr-1',
          walletId: 'wa-treasury',
          network: 'StellarTestnet',
          requester: { userId: 'us-1' },
          requestBody: { kind: 'Native', to: PAYEE, amount: '25000000' },
          status: 'Confirmed',
          txHash,
          fee: '100',
          dateRequested: '2026-09-30T10:00:00.000Z',
          dateConfirmed: '2026-09-30T10:00:04.000Z',
        },
      },
      txHash,
    )
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      transactionType: 'payment',
      sellerIdentifier: TREASURY,
      buyerIdentifier: PAYEE,
      quantity: '2.5000000',
    })
  })

  it('leaves out the amount of a native transfer on another network', async () => {
    const txHash = `0x${'ab'.repeat(32)}`
    const to = `0x${'12'.repeat(20)}`
    const records = await exported(
      'wh-xfr-2',
      'wallet.transfer.confirmed',
      {
        transferRequest: {
          id: 'xfr-2',
          walletId: 'wa-evm',
          network: 'Ethereum',
          requester: { userId: 'us-1' },
          // one eth in wei, which read as stroops would be 100 billion xlm
          requestBody: { kind: 'Native', to, amount: '1000000000000000000' },
          status: 'Confirmed',
          txHash,
          dateRequested: '2026-09-30T10:00:00.000Z',
        },
      },
      txHash,
    )
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ transactionType: 'payment', buyerIdentifier: to, quantity: '0' })
  })

  it('decodes the envelope of a transaction request', async () => {
    const txHash = 'd'.repeat(64)
    const records = await exported(
      'wh-tx-1',
      'wallet.transaction.confirmed',
      transactionRequest('wa-other', hex(payment(OTHER, '1.25')), txHash),
      txHash,
    )
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      transactionType: 'payment',
      sellerIdentifier: OTHER,
      buyerIdentifier: PAYEE,
      quantity: '1.2500000',
    })
  })

  it('reads the inner transaction of a fee bump', async () => {
    const txHash = 'e'.repeat(64)
    const bump = TransactionBuilder.buildFeeBumpTransaction(TREASURY, BASE_FEE, payment(OTHER, '3'), Networks.TESTNET)
    const records = await exported(
      'wh-tx-2',
      'wallet.transaction.confirmed',
      transactionRequest('wa-other', hex(bump), txHash),
      txHash,
    )
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({ sellerIdentifier: OTHER, buyerIdentifier: PAYEE, quantity: '3.0000000' })
  })

  it('falls back to the event when the envelope does not decode', async () => {
    const txHash = 'f'.repeat(64)
    const records = await exported(
      'wh-tx-3',
      'wallet.transaction.confirmed',
      transactionRequest('wa-treasury', '0xnot-an-envelope', txHash),
      txHash,
    )
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      transactionType: 'invoke_host_function',
      sellerIdentifier: TREASURY,
      quantity: '0',
    })
  })
})
