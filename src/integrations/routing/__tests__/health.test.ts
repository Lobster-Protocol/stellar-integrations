import { describe, it, expect } from 'vitest'

import { getRoutingHealth } from '../health'

describe('getRoutingHealth', () => {
  it('quotes the broker on mainnet from the configured endpoint, no key needed', () => {
    const h = getRoutingHealth('mainnet')
    expect(h.brokerQuoteEnabled).toBe(true)
    expect(h.brokerEndpoint).toBe('https://api.stellar.broker')
  })

  it('reports fallback enabled on mainnet (soroswap router configured)', () => {
    expect(getRoutingHealth('mainnet').fallbackEnabled).toBe(true)
  })

  it('reports fallback enabled on testnet (soroswap router wired there too)', () => {
    expect(getRoutingHealth('testnet').fallbackEnabled).toBe(true)
  })

  it('skips the broker on testnet, it only runs on mainnet', () => {
    expect(getRoutingHealth('testnet').brokerQuoteEnabled).toBe(false)
  })
})
