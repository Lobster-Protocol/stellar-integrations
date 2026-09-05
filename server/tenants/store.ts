import { DEMO_TENANT_ID, requireDemoTenant, demoDfnsConfigured } from './demo'
import { redactTenant, type Tenant, type TenantSummary } from './types'

// the relay holds no durable state today, so this interface is the seam a real
// datastore (managed postgres + kms-wrapped secrets) plugs into later. the memory
// store serves the one env-sourced demo tenant so nothing here depends on infra
// that does not exist yet; a client tenant is a store row, never an env read.
export interface TenantStore {
  get(id: string): Promise<Tenant | null>
  list(): Promise<TenantSummary[]>
}

// the demo tenant is resolved live from process.env on each get, so a rotated
// token or key is picked up without a restart (dfnsClientFor re-keys on the creds
// hash). DEMO_TENANT_ID is the only id this store ever answers.
export class MemoryTenantStore implements TenantStore {
  async get(id: string): Promise<Tenant | null> {
    if (id === DEMO_TENANT_ID) {
      return demoDfnsConfigured() ? requireDemoTenant() : null
    }
    return null
  }

  async list(): Promise<TenantSummary[]> {
    if (!demoDfnsConfigured()) return []
    return [redactTenant(requireDemoTenant())]
  }
}

let store: TenantStore = new MemoryTenantStore()

export function getTenantStore(): TenantStore {
  return store
}

// tests swap in a fake store; prod never calls this.
export function setTenantStore(s: TenantStore): void {
  store = s
}
