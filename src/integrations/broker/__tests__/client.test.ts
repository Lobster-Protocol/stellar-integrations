import { describe, it, expect, vi, beforeEach } from 'vitest'

const { connectFn, closeFn, FakeBrokerClient } = vi.hoisted(() => {
  const connectFn = vi.fn()
  const closeFn = vi.fn()
  class FakeBrokerClient {
    partnerKey: string
    status: 'disconnected' | 'ready' | 'quote' | 'trade'
    constructor(opts: { partnerKey: string }) {
      this.partnerKey = opts.partnerKey
      this.status = 'disconnected'
    }
    async connect() {
      this.status = 'ready'
      await connectFn()
      return this
    }
    close() {
      closeFn()
      this.status = 'disconnected'
    }
  }
  return { connectFn, closeFn, FakeBrokerClient }
})

vi.mock('@stellar-broker/client', () => ({
  StellarBrokerClient: FakeBrokerClient,
}))

import { getBrokerClient, disposeBrokerClient } from '../client'

beforeEach(() => {
  disposeBrokerClient()
  connectFn.mockReset().mockResolvedValue(undefined)
  closeFn.mockReset()
})

describe('getBrokerClient', () => {
  it('throws when the partner key is missing', async () => {
    const prev = import.meta.env.VITE_STELLAR_BROKER_PARTNER_KEY
    Reflect.set(import.meta.env, 'VITE_STELLAR_BROKER_PARTNER_KEY', '')
    await expect(getBrokerClient()).rejects.toThrow(/VITE_STELLAR_BROKER_PARTNER_KEY/)
    Reflect.set(import.meta.env, 'VITE_STELLAR_BROKER_PARTNER_KEY', prev)
  })

  it('returns the same instance for two concurrent callers', async () => {
    Reflect.set(import.meta.env, 'VITE_STELLAR_BROKER_PARTNER_KEY', 'test-partner-key')
    const [a, b] = await Promise.all([getBrokerClient(), getBrokerClient()])
    expect(a).toBe(b)
    expect(connectFn).toHaveBeenCalledTimes(1)
  })

  it('rebuilds after dispose', async () => {
    Reflect.set(import.meta.env, 'VITE_STELLAR_BROKER_PARTNER_KEY', 'test-partner-key')
    const first = await getBrokerClient()
    disposeBrokerClient()
    expect(closeFn).toHaveBeenCalledTimes(1)
    const second = await getBrokerClient()
    expect(second).not.toBe(first)
    expect(connectFn).toHaveBeenCalledTimes(2)
  })
})
