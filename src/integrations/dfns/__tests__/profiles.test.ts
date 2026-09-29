import { describe, it, expect, beforeEach } from 'vitest'

import {
  DEMO_PROFILE_ID,
  clientProfiles,
  listProfiles,
  activeProfile,
  activeProfileId,
  setActiveProfile,
  clearActiveProfile,
  addClientProfile,
  removeClientProfile,
  assertRelayUrl,
  selectedWallet,
  setSelectedWallet,
} from '../profiles'

// the test env sets VITE_LOBSTER_API_URL, so the demo profile is present.

beforeEach(() => {
  localStorage.clear()
})

const conn = { label: 'Acme DFNS', relayBaseUrl: 'https://relay.acme.test', apiToken: 'read-tok' }

describe('dfns profiles', () => {
  it('starts with no client profiles and nothing active', () => {
    expect(clientProfiles()).toEqual([])
    // the demo exists, but it is not the default: nothing resolves until picked.
    expect(listProfiles().some((p) => p.id === DEMO_PROFILE_ID)).toBe(true)
    expect(activeProfileId()).toBeNull()
    expect(activeProfile()).toBeNull()
  })

  it('adds a client profile and makes it the active one', () => {
    const p = addClientProfile(conn)
    expect(p.kind).toBe('client')
    expect(p.id).toMatch(/^client-/)
    expect(clientProfiles()).toHaveLength(1)
    expect(activeProfileId()).toBe(p.id)
    expect(activeProfile()?.relayBaseUrl).toBe('https://relay.acme.test')
  })

  it('never stores the demo id as a client profile', () => {
    addClientProfile(conn)
    expect(clientProfiles().some((p) => p.id === DEMO_PROFILE_ID)).toBe(false)
  })

  it('switches the active profile between the demo and a client', () => {
    const a = addClientProfile({ ...conn, label: 'A' })
    expect(clientProfiles()).toHaveLength(1)
    setActiveProfile(DEMO_PROFILE_ID)
    expect(activeProfile()?.id).toBe(DEMO_PROFILE_ID)
    setActiveProfile(a.id)
    expect(activeProfile()?.id).toBe(a.id)
  })

  it('deselects when the active profile is removed, never falling back to the demo', () => {
    const a = addClientProfile({ ...conn, label: 'A' })
    const b = addClientProfile({ ...conn, label: 'B' })
    expect(activeProfileId()).toBe(b.id)
    removeClientProfile(b.id)
    expect(clientProfiles().some((p) => p.id === b.id)).toBe(false)
    expect(activeProfileId()).toBeNull()
    expect(clientProfiles().some((p) => p.id === a.id)).toBe(true)
  })

  it('ignores a stored active id that no longer resolves', () => {
    const p = addClientProfile(conn)
    expect(activeProfileId()).toBe(p.id)
    setActiveProfile('client-gone')
    expect(activeProfileId()).toBeNull()
    expect(activeProfile()).toBeNull()
  })

  it('refuses to add a client profile with an unsafe relay url', () => {
    expect(() => addClientProfile({ ...conn, relayBaseUrl: 'http://relay.acme.test' })).toThrow(/https/)
    expect(clientProfiles()).toHaveLength(0)
  })

  it('clears the demo operator token and active selection on disconnect', () => {
    setActiveProfile(DEMO_PROFILE_ID)
    localStorage.setItem('lob_operator_token', 'op-secret')
    expect(activeProfileId()).toBe(DEMO_PROFILE_ID)
    clearActiveProfile()
    // the operator token must not linger in storage for a later session to reuse.
    expect(activeProfileId()).toBeNull()
    expect(localStorage.getItem('lob_operator_token')).toBeNull()
  })
})

describe('assertRelayUrl (the money-token destination guard)', () => {
  it('accepts a public https url', () => {
    expect(assertRelayUrl('https://relay.acme.example', 'client')).toBe('https://relay.acme.example')
  })

  it('refuses http for a client (tokens must not go in the clear)', () => {
    expect(() => assertRelayUrl('http://relay.acme.example', 'client')).toThrow(/https/)
  })

  it('refuses a private or loopback host for a client', () => {
    expect(() => assertRelayUrl('https://localhost:8787', 'client')).toThrow(/private or loopback/)
    expect(() => assertRelayUrl('https://192.168.1.10', 'client')).toThrow(/private or loopback/)
    expect(() => assertRelayUrl('https://169.254.1.1', 'client')).toThrow(/private or loopback/)
  })

  it('refuses credentials embedded in the url', () => {
    expect(() => assertRelayUrl('https://user:pass@relay.acme.example', 'client')).toThrow(/username or password/)
  })

  it('refuses something that is not a url', () => {
    expect(() => assertRelayUrl('relay.acme.example', 'client')).toThrow(/valid URL/)
  })

  it('allows http on localhost only for the demo', () => {
    expect(assertRelayUrl('http://localhost:8787', 'demo')).toBe('http://localhost:8787')
  })

  it('refuses a client relay url that is actually the lobster demo relay', () => {
    // the check keys on the demo host, so set it to a public one to reach it.
    const orig = import.meta.env.VITE_LOBSTER_API_URL
    Reflect.set(import.meta.env, 'VITE_LOBSTER_API_URL', 'https://demo.lobster.example')
    try {
      expect(() => assertRelayUrl('https://demo.lobster.example/', 'client')).toThrow(/Lobster demo relay/)
    } finally {
      Reflect.set(import.meta.env, 'VITE_LOBSTER_API_URL', orig)
    }
  })
})

describe('selectedWallet (which of a client org wallets acts as custody)', () => {
  it('remembers a pick per profile and per network', () => {
    const p = addClientProfile(conn)
    expect(selectedWallet(p.id, 'StellarTestnet')).toBeNull()
    setSelectedWallet(p.id, { walletId: 'wa-1', address: 'GABC', network: 'StellarTestnet' })
    expect(selectedWallet(p.id, 'StellarTestnet')?.address).toBe('GABC')
    // a different network keeps its own pick, independent of testnet
    expect(selectedWallet(p.id, 'Stellar')).toBeNull()
  })

  it('forgets a profile pick when the profile is removed', () => {
    const p = addClientProfile(conn)
    setSelectedWallet(p.id, { walletId: 'wa-1', address: 'GABC', network: 'StellarTestnet' })
    removeClientProfile(p.id)
    expect(selectedWallet(p.id, 'StellarTestnet')).toBeNull()
  })
})
