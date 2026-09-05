import { describe, it, expect, beforeEach } from 'vitest'

import {
  DEMO_PROFILE_ID,
  clientProfiles,
  listProfiles,
  activeProfile,
  activeProfileId,
  setActiveProfile,
  addClientProfile,
  removeClientProfile,
  assertRelayUrl,
} from '../profiles'

// the test env sets VITE_LOBSTER_API_URL, so the demo profile is present and is
// the default active one. these cover the client-profile crud + the active
// selection the multi-profile custody switch relies on.

beforeEach(() => {
  localStorage.clear()
})

const conn = { label: 'Acme DFNS', relayBaseUrl: 'https://relay.acme.test', apiToken: 'read-tok' }

describe('dfns profiles', () => {
  it('starts with no client profiles and the demo active', () => {
    expect(clientProfiles()).toEqual([])
    expect(activeProfileId()).toBe(DEMO_PROFILE_ID)
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

  it('falls back off a removed active profile to one that still resolves', () => {
    const a = addClientProfile({ ...conn, label: 'A' })
    const b = addClientProfile({ ...conn, label: 'B' })
    expect(activeProfileId()).toBe(b.id)
    removeClientProfile(b.id)
    expect(clientProfiles().some((p) => p.id === b.id)).toBe(false)
    const fell = activeProfileId()
    expect(fell).not.toBe(b.id)
    expect(listProfiles().some((p) => p.id === fell)).toBe(true)
    // a still resolves
    expect(clientProfiles().some((p) => p.id === a.id)).toBe(true)
  })

  it('ignores a stored active id that no longer resolves', () => {
    addClientProfile(conn)
    setActiveProfile('client-gone')
    expect(activeProfileId()).not.toBe('client-gone')
    expect(activeProfile()).not.toBeNull()
  })

  it('refuses to add a client profile with an unsafe relay url', () => {
    expect(() => addClientProfile({ ...conn, relayBaseUrl: 'http://relay.acme.test' })).toThrow(/https/)
    expect(clientProfiles()).toHaveLength(0)
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
})
