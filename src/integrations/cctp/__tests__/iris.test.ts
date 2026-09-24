import { describe, it, expect, vi, afterEach } from 'vitest'

import { fetchAttestation, fetchFees, maxFeeFor, IrisError } from '../iris'

const TX = `0x${'ab'.repeat(32)}`
// the head of a real Base to Stellar message: version 1, domain 6, domain 27
const MSG = '0x00000001000000060000001b' + 'cd'.repeat(452)
const ATT = '0x' + '47'.repeat(130)

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async () => ({ status, json: async () => body }) as unknown as Response)
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => vi.unstubAllGlobals())

describe('fetchAttestation', () => {
  it('reads a 404 as not indexed yet, which is how every transfer starts', async () => {
    mockFetch(404, { error: 'Message not found for provided parameters' })
    await expect(fetchAttestation('testnet', 6, TX)).resolves.toEqual({
      state: 'pending',
      delayReason: null,
    })
  })

  it('returns the message and attestation once Circle has signed', async () => {
    mockFetch(200, {
      messages: [
        {
          attestation: ATT,
          message: MSG,
          eventNonce: '0xe70e',
          cctpVersion: 2,
          status: 'complete',
          delayReason: null,
        },
      ],
    })
    const got = await fetchAttestation('mainnet', 6, TX)
    expect(got).toEqual({ state: 'complete', message: MSG, attestation: ATT, eventNonce: '0xe70e' })
  })

  it('stays pending while the attestation still reads PENDING', async () => {
    mockFetch(200, {
      messages: [
        { attestation: 'PENDING', message: '0x', eventNonce: '0x1', cctpVersion: 2, status: 'pending_confirmations' },
      ],
    })
    await expect(fetchAttestation('testnet', 6, TX)).resolves.toMatchObject({ state: 'pending' })
  })

  it("passes Circle's reason through when a transfer is held", async () => {
    mockFetch(200, {
      messages: [
        {
          attestation: 'PENDING',
          message: MSG,
          eventNonce: '0x1',
          cctpVersion: 2,
          status: 'pending_confirmations',
          delayReason: 'insufficient_fee',
        },
      ],
    })
    await expect(fetchAttestation('testnet', 6, TX)).resolves.toEqual({
      state: 'pending',
      delayReason: 'insufficient_fee',
    })
  })

  it('asks the sandbox on testnet and the live service on mainnet', async () => {
    const fn = mockFetch(404, {})
    await fetchAttestation('testnet', 6, TX)
    await fetchAttestation('mainnet', 6, TX)
    const urls = fn.mock.calls.map((c) => String((c as unknown[])[0]))
    expect(urls[0]).toContain('iris-api-sandbox.circle.com/v2/messages/6?transactionHash=')
    expect(urls[1]).toContain('iris-api.circle.com/v2/messages/6?transactionHash=')
    expect(urls[1]).not.toContain('sandbox')
  })

  it('refuses something that is not an EVM transaction hash before calling out', async () => {
    const fn = mockFetch(200, {})
    await expect(fetchAttestation('testnet', 6, '0x1234')).rejects.toThrow(IrisError)
    expect(fn).not.toHaveBeenCalled()
  })

  it('refuses a body it does not recognise instead of guessing', async () => {
    mockFetch(200, { unexpected: true })
    await expect(fetchAttestation('testnet', 6, TX)).rejects.toThrow(/recognise/)
  })

  it('names a rate limit as one', async () => {
    mockFetch(429, {})
    await expect(fetchAttestation('testnet', 6, TX)).rejects.toThrow(/rate limiting/)
  })
})

describe('fetchFees', () => {
  it('splits the two tiers Circle returns', async () => {
    mockFetch(200, [
      { finalityThreshold: 1000, minimumFee: 1.3 },
      { finalityThreshold: 2000, minimumFee: 0 },
    ])
    await expect(fetchFees('testnet', 6)).resolves.toEqual({ fastBps: 1.3, standardBps: 0 })
  })

  it('reports no fast tier rather than inventing one', async () => {
    mockFetch(200, [{ finalityThreshold: 2000, minimumFee: 0 }])
    await expect(fetchFees('testnet', 6)).resolves.toEqual({ fastBps: null, standardBps: 0 })
  })
})

describe('maxFeeFor', () => {
  it('covers the fee Circle really took on a real transfer', () => {
    // 79.784024 USDC from Base, 1.3 bps, Circle executed 10371 units
    expect(maxFeeFor(79_784_024n, 1.3)).toBeGreaterThanOrEqual(10_371n)
  })

  it('keeps a fractional basis point instead of rounding it away', () => {
    expect(maxFeeFor(1_000_000_000n, 1.3, 1)).toBe(130_000n)
  })

  it('never declares zero on a fast transfer, even a tiny one', () => {
    expect(maxFeeFor(10n, 1)).toBe(1n)
  })

  it('declares nothing on a free standard transfer', () => {
    expect(maxFeeFor(1_000_000n, 0)).toBe(0n)
  })
})
