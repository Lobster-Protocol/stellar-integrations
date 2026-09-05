import { describe, it, expect, beforeEach, afterEach } from 'vitest'

import { DEMO_TENANT_ID, requireDemoTenant, demoDfnsConfigured } from '../tenants/demo'
import { dfnsClientFor, dropDfnsClient } from '../tenants/client'
import { MemoryTenantStore } from '../tenants/store'
import { assertResolvedTenant, assertDistinctFromDemo } from '../tenants/guard'
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

function clearDfnsEnv() {
  for (const k of DFNS_ENV) delete process.env[k]
}

// a minimal env that requireDemoTenant accepts. inline key avoids a disk read;
// the keysigner does not parse the PEM until the first authed call, so a stub
// value is fine for building and caching clients that never make a request.
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
  for (const k of DFNS_ENV) saved[k] = process.env[k]
  clearDfnsEnv()
})

afterEach(() => {
  for (const k of DFNS_ENV) {
    if (saved[k] === undefined) delete process.env[k]
    else process.env[k] = saved[k]
  }
})

describe('demo tenant seeded from env', () => {
  it('reports unconfigured until a dfns credential is present', () => {
    expect(demoDfnsConfigured()).toBe(false)
    process.env.DFNS_AUTH_TOKEN = 'tok'
    expect(demoDfnsConfigured()).toBe(true)
  })

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

  it('throws the same missing-env error the old client did', () => {
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

describe('memory tenant store', () => {
  it('answers the demo tenant only when configured', async () => {
    const store = new MemoryTenantStore()
    expect(await store.get(DEMO_TENANT_ID)).toBeNull()
    seedDemoEnv()
    expect((await store.get(DEMO_TENANT_ID))?.id).toBe(DEMO_TENANT_ID)
  })

  it('never answers an unknown tenant id from env', async () => {
    seedDemoEnv()
    expect(await new MemoryTenantStore().get('client-x')).toBeNull()
  })

  it('lists a redacted summary that carries no secret', async () => {
    seedDemoEnv()
    const [summary] = await new MemoryTenantStore().list()
    expect(summary).toEqual({
      id: DEMO_TENANT_ID,
      kind: 'demo',
      label: 'Lobster demo custody',
      network: 'StellarTestnet',
      treasuryWalletId: 'wa-demo',
    })
    expect(JSON.stringify(summary)).not.toContain('stub-pem')
    expect(JSON.stringify(summary)).not.toContain('tok-demo')
  })
})

describe('demo / client separation guard', () => {
  const demo = fakeTenant({ id: DEMO_TENANT_ID, kind: 'demo', dfns: { baseUrl: 'u', authToken: 'tok-demo', credId: 'cred-demo', privateKey: 'k' }, treasury: { walletId: 'wa-demo', network: 'StellarTestnet' } })

  it('accepts a tenant that resolves to itself', () => {
    expect(() => assertResolvedTenant(DEMO_TENANT_ID, demo)).not.toThrow()
    expect(() => assertResolvedTenant('client-a', fakeTenant())).not.toThrow()
  })

  it('refuses a mismatched resolution', () => {
    expect(() => assertResolvedTenant('client-a', demo)).toThrow(/resolved to/)
  })

  it('refuses the demo tenant standing in for a client', () => {
    const demoUnderClientId = fakeTenant({ id: 'client-a', kind: 'demo' })
    expect(() => assertResolvedTenant('client-a', demoUnderClientId)).toThrow(/cannot act as a client/)
  })

  it('refuses a client that reuses the demo credentials or treasury', () => {
    expect(() => assertDistinctFromDemo(fakeTenant({ dfns: { ...fakeTenant().dfns, credId: 'cred-demo' } }), demo)).toThrow(/reuse/)
    expect(() => assertDistinctFromDemo(fakeTenant({ dfns: { ...fakeTenant().dfns, authToken: 'tok-demo' } }), demo)).toThrow(/reuse/)
    expect(() => assertDistinctFromDemo(fakeTenant({ treasury: { walletId: 'wa-demo', network: 'StellarTestnet' } }), demo)).toThrow(/reuse/)
  })

  it('refuses a client claiming the reserved demo id', () => {
    expect(() => assertDistinctFromDemo(fakeTenant({ id: DEMO_TENANT_ID }), demo)).toThrow(/reserved demo id/)
  })

  it('accepts a genuinely distinct client', () => {
    expect(() => assertDistinctFromDemo(fakeTenant(), demo)).not.toThrow()
  })
})
