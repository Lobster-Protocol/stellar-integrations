import { describe, it, expect, afterEach } from 'vitest'

import { getRoutingHealth } from '../health'

const ORIG_PARTNER = import.meta.env.VITE_STELLAR_BROKER_PARTNER_KEY

afterEach(() => {
  Reflect.set(import.meta.env, 'VITE_STELLAR_BROKER_PARTNER_KEY', ORIG_PARTNER)
})

describe('getRoutingHealth', () => {
  it('reports broker disabled when partner key is empty', () => {
    Reflect.set(import.meta.env, 'VITE_STELLAR_BROKER_PARTNER_KEY', '')
    const h = getRoutingHealth('mainnet')
    expect(h.brokerEnabled).toBe(false)
  })

  it('reports broker enabled when partner key is set and endpoint is configured', () => {
    Reflect.set(import.meta.env, 'VITE_STELLAR_BROKER_PARTNER_KEY', 'test-partner-key')
    const h = getRoutingHealth('mainnet')
    expect(h.brokerEnabled).toBe(true)
    expect(h.brokerEndpoint).toBe('https://api.stellar.broker')
  })

  it('keeps broker quoting enabled without a partner key (keyless price discovery)', () => {
    Reflect.set(import.meta.env, 'VITE_STELLAR_BROKER_PARTNER_KEY', '')
    const h = getRoutingHealth('mainnet')
    expect(h.brokerQuoteEnabled).toBe(true)
    expect(h.brokerEnabled).toBe(false)
  })

  it('reports fallback enabled on mainnet (soroswap router configured)', () => {
    Reflect.set(import.meta.env, 'VITE_STELLAR_BROKER_PARTNER_KEY', 'test-partner-key')
    const h = getRoutingHealth('mainnet')
    expect(h.fallbackEnabled).toBe(true)
  })

  it('reports fallback disabled on testnet (soroswap router empty)', () => {
    Reflect.set(import.meta.env, 'VITE_STELLAR_BROKER_PARTNER_KEY', 'test-partner-key')
    const h = getRoutingHealth('testnet')
    expect(h.fallbackEnabled).toBe(false)
  })

  it('returns the configured endpoint regardless of partner key state', () => {
    Reflect.set(import.meta.env, 'VITE_STELLAR_BROKER_PARTNER_KEY', '')
    const h = getRoutingHealth('mainnet')
    expect(h.brokerEndpoint).toBe('https://api.stellar.broker')
  })
})
