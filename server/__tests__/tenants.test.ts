import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { DEMO_TENANT_ID, requireDemoTenant } from '../tenants/demo'
import { dfnsClientFor, dropDfnsClient } from '../tenants/client'
import type { Tenant } from '../tenants/types'

const DFNS_ENV = [
  'DFNS_API_URL',
  'DFNS_AUTH_TOKEN',
  'DFNS_CRED_ID',
  'DFNS_PRIVATE_KEY',
  'DFNS_PRIVATE_KEY_PATH',
  'DFNS_STELLAR_WALLET_ID',
  'DFNS_STELLAR_NETWORK',
  'DFNS_ORG_ID',
]

let saved: Record<string, string | undefined>

// a minimal env requireDemoTenant accepts, key inline to skip a disk read. the
// keysigner only parses the pem on its first authed call, so a stub is enough
function seedDemoEnv() {
  process.env.DFNS_API_URL = 'https://api.dfns.test'
  process.env.DFNS_AUTH_TOKEN = 'tok-demo'
  process.env.DFNS_CRED_ID = 'cred-demo'
  process.env.DFNS_PRIVATE_KEY = 'stub-pem'
  process.env.DFNS_STELLAR_WALLET_ID = 'wa-demo'
  process.env.DFNS_STELLAR_NETWORK = 'StellarTestnet'
}

function fakeTenant(over: Partial<Tenant> = {}): Tenant {
  return {
    id: 'client-a',
    kind: 'client',
    label: 'Client A',
    dfns: { baseUrl: 'https://api.dfns.test', authToken: 'tok-a', credId: 'cred-a', privateKey: 'pem-a' },
    treasury: { walletId: 'wa-a', network: 'StellarTestnet' },
    guard: null,
    ...over,
  }
}

beforeEach(() => {
  saved = {}
  for (const k of DFNS_ENV) {
    saved[k] = process.env[k]
    delete process.env[k]
  }
})

afterEach(() => {
  for (const k of DFNS_ENV) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('demo tenant seeded from env', () => {
  it('builds the demo tenant from the dfns env vars', () => {
    seedDemoEnv()
    process.env.DFNS_ORG_ID = 'org-demo'
    const t = requireDemoTenant()
    expect(t.id).toBe(DEMO_TENANT_ID)
    expect(t.kind).toBe('demo')
    expect(t.dfns).toMatchObject({
      baseUrl: 'https://api.dfns.test',
      authToken: 'tok-demo',
      credId: 'cred-demo',
      orgId: 'org-demo',
    })
    expect(t.treasury).toEqual({ walletId: 'wa-demo', network: 'StellarTestnet' })
  })

  it('leaves the treasury null when no wallet id is set', () => {
    seedDemoEnv()
    delete process.env.DFNS_STELLAR_WALLET_ID
    expect(requireDemoTenant().treasury).toBeNull()
  })

  it('names the missing env var when the config is incomplete', () => {
    process.env.DFNS_AUTH_TOKEN = 'tok'
    expect(() => requireDemoTenant()).toThrow(/DFNS_API_URL env var missing/)
  })
})

describe('per-tenant dfns client factory', () => {
  afterEach(() => {
    dropDfnsClient('client-a')
    dropDfnsClient('client-b')
    dropDfnsClient(DEMO_TENANT_ID)
  })

  it('reuses one client for a tenant across calls', () => {
    const t = fakeTenant()
    expect(dfnsClientFor(t)).toBe(dfnsClientFor(t))
  })

  it('never shares a client between two tenants', () => {
    const a = dfnsClientFor(fakeTenant({ id: 'client-a' }))
    const b = dfnsClientFor(fakeTenant({ id: 'client-b', dfns: fakeTenant().dfns }))
    expect(a).not.toBe(b)
  })

  it('rebuilds the client when a tenant rotates its key', () => {
    const before = dfnsClientFor(fakeTenant())
    const after = dfnsClientFor(fakeTenant({ dfns: { ...fakeTenant().dfns, privateKey: 'pem-rotated' } }))
    expect(after).not.toBe(before)
  })

  it('drops a cached client on demand', () => {
    const first = dfnsClientFor(fakeTenant())
    dropDfnsClient('client-a')
    expect(dfnsClientFor(fakeTenant())).not.toBe(first)
  })
})
