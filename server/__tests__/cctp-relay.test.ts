// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { Keypair } from '@stellar/stellar-sdk'

import { deliver, relayKeypair, takeDailySlot, resetDailySlotsForTest, RelayRefused } from '../cctp/relay'
import { registerCctpRoutes } from '../cctp/routes'

// a real Base to Stellar transfer on mainnet, paying GAMNA2Q6...
const REAL_MESSAGE =
  '0x00000001000000060000001be70efeb915fb9ae3e3ba0df06a6aaceb145d350fff37eabbf1e6cee6f88d01f7' +
  '00000000000000000000000028b5a0e9c621a5badaa536219b3a228c8168cf5d' +
  '09a3773ffd1ff361f8315d629adf17d3e4730fd00a6900715431ed4b142aded2' +
  '72bd20ff2f8281801bb05b7c29179026933256fabafeb13e94efd8ddbcfcf291' +
  '000003e8000003e800000001000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda02913' +
  '72bd20ff2f8281801bb05b7c29179026933256fabafeb13e94efd8ddbcfcf291' +
  '0000000000000000000000000000000000000000000000000000000004c16858' +
  '000000000000000000000000ea258496a9311ffe29cdf920ca0e8bb4b41c9f04' +
  '000000000000000000000000000000000000000000000000000000000000309d' +
  '0000000000000000000000000000000000000000000000000000000000002883' +
  '0000000000000000000000000000000000000000000000000000000003d9a2ab' +
  '0000000000000000000000000000000000000000000000000000000000000038' +
  '47414d4e413251364e545a5355424c4d45584c544958594f5245374f584a4a424d454749583754324f5844414b49413743434b4e34524a56'
const REAL_RECIPIENT = 'GAMNA2Q6NTZSUBLMEXLTIXYORE7OXJJBMEGIX7T2OXDAKIA7CCKN4RJV'
const SOMEONE_ELSE = 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU'
const BURN = `0x${'ab'.repeat(32)}`

// what Circle answers once it has signed that transfer
const ATTESTED = {
  messages: [
    {
      message: REAL_MESSAGE,
      attestation: `0x${'47'.repeat(130)}`,
      eventNonce: '0xe70e',
      cctpVersion: 2,
      status: 'complete',
      delayReason: null,
    },
  ],
}

function irisAnswers(status: number, body: unknown) {
  const fn = vi.fn(async () => ({ status, json: async () => body }) as unknown as Response)
  vi.stubGlobal('fetch', fn)
  return fn
}

const env = { ...process.env }
afterEach(() => {
  vi.unstubAllGlobals()
  process.env = { ...env }
  resetDailySlotsForTest()
})

describe('relayKeypair', () => {
  it('stays shut when no key is configured', () => {
    delete process.env.CCTP_RELAY_SECRET
    expect(() => relayKeypair('testnet')).toThrow(RelayRefused)
  })

  it('refuses a value that is not a Stellar secret', () => {
    process.env.CCTP_RELAY_SECRET = 'not-a-secret'
    expect(() => relayKeypair('testnet')).toThrow(/not configured/)
  })

  it('works on testnet once a key is set', () => {
    const kp = Keypair.random()
    process.env.CCTP_RELAY_SECRET = kp.secret()
    expect(relayKeypair('testnet').publicKey()).toBe(kp.publicKey())
  })

  it('needs its own switch before spending on mainnet', () => {
    process.env.CCTP_RELAY_SECRET = Keypair.random().secret()
    delete process.env.CCTP_RELAY_MAINNET
    expect(() => relayKeypair('mainnet')).toThrow(/testnet only/)
    process.env.CCTP_RELAY_MAINNET = '1'
    expect(() => relayKeypair('mainnet')).not.toThrow()
  })
})

describe('takeDailySlot', () => {
  it('stops at the daily cap and starts again the next day', () => {
    process.env.CCTP_RELAY_DAILY_CAP = '2'
    const day1 = new Date('2026-09-24T10:00:00Z')
    takeDailySlot(day1)
    takeDailySlot(day1)
    expect(() => takeDailySlot(day1)).toThrow(/daily cap of 2/)
    expect(() => takeDailySlot(new Date('2026-09-25T00:00:01Z'))).not.toThrow()
  })
})

describe('deliver', () => {
  beforeEach(() => {
    process.env.CCTP_RELAY_SECRET = Keypair.random().secret()
  })

  it('refuses a recipient that is not an account before asking anyone', async () => {
    const fn = irisAnswers(200, {})
    await expect(
      deliver({ network: 'testnet', sourceDomain: 6, burnTxHash: BURN, recipient: 'nope' }),
    ).rejects.toThrow(RelayRefused)
    expect(fn).not.toHaveBeenCalled()
  })

  it('reports a burn Circle has not signed yet, and spends nothing', async () => {
    irisAnswers(404, { error: 'Message not found for provided parameters' })
    await expect(
      deliver({ network: 'testnet', sourceDomain: 6, burnTxHash: BURN, recipient: SOMEONE_ELSE }),
    ).resolves.toEqual({ status: 'not-attested-yet' })
  })

  it('refuses to deliver a transfer that pays someone other than the caller named', async () => {
    const fn = irisAnswers(200, ATTESTED)
    const attempt = deliver({ network: 'mainnet', sourceDomain: 6, burnTxHash: BURN, recipient: SOMEONE_ELSE })
    await expect(attempt).rejects.toThrow(/pays GAMNA2Q6/)
    // the only call out was Circle; nothing reached Stellar
    expect(fn).toHaveBeenCalledTimes(1)
    expect(String((fn.mock.calls[0] as unknown[])[0])).toContain('iris-api.circle.com')
  })

  it('refuses the same transfer when the caller claims another source chain', async () => {
    irisAnswers(200, ATTESTED)
    await expect(
      deliver({ network: 'mainnet', sourceDomain: 3, burnTxHash: BURN, recipient: REAL_RECIPIENT }),
    ).rejects.toThrow(/came from domain 6/)
  })

  it('refuses a testnet delivery of a message minting to the mainnet forwarder', async () => {
    irisAnswers(200, ATTESTED)
    await expect(
      deliver({ network: 'testnet', sourceDomain: 6, burnTxHash: BURN, recipient: REAL_RECIPIENT }),
    ).rejects.toThrow(/not the forwarder/)
  })
})

describe('cctp routes', () => {
  const pass = async (_c: unknown, next: () => Promise<void>) => next()
  function appWith(operatorGuard = pass) {
    const app = new Hono()
    registerCctpRoutes(app, { rateLimit: pass, tokenGuard: pass, operatorGuard: operatorGuard as never })
    return app
  }
  const deliverTo = (app: Hono, recipient: string) =>
    app.request('/cctp/deliver', {
      method: 'POST',
      body: JSON.stringify({ network: 'testnet', sourceDomain: 6, txHash: BURN, recipient }),
      headers: { 'content-type': 'application/json' },
    })

  it('lists the testnet source chains with Stellar as the destination', async () => {
    const res = await appWith().request('/cctp/chains?network=testnet')
    const body = (await res.json()) as { destinationDomain: number; items: Array<{ name: string }> }
    expect(res.status).toBe(200)
    expect(body.destinationDomain).toBe(27)
    expect(body.items.map((i) => i.name)).toEqual(['Base Sepolia', 'Arbitrum Sepolia', 'Ethereum Sepolia'])
  })

  it('refuses an unknown network', async () => {
    expect((await appWith().request('/cctp/chains?network=devnet')).status).toBe(400)
  })

  it('refuses a domain we do not burn from', async () => {
    expect((await appWith().request('/cctp/fees?network=testnet&domain=25')).status).toBe(400)
  })

  it('refuses a malformed burn hash on the message lookup', async () => {
    expect((await appWith().request('/cctp/message?network=testnet&domain=6&txHash=0x12')).status).toBe(400)
  })

  it('keeps delivery behind the operator gate', async () => {
    const shut = async () => new Response('unauthorized', { status: 401 })
    expect((await deliverTo(appWith(shut as never), SOMEONE_ELSE)).status).toBe(401)
  })

  it('validates the delivery body before doing anything', async () => {
    expect((await deliverTo(appWith(), 'nope')).status).toBe(400)
  })

  it('answers 404 while Circle has not signed the burn', async () => {
    process.env.CCTP_RELAY_SECRET = Keypair.random().secret()
    irisAnswers(404, {})
    expect((await deliverTo(appWith(), SOMEONE_ELSE)).status).toBe(404)
  })
})
