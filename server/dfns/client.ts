import type { DfnsApiClient } from '@dfns/sdk'

import { dfnsClientFor } from '../tenants/client'
import { requireDemoTenant } from '../tenants/demo'

// DEPRECATED 2026-09: the demo tenant's dfns client. kept so the routes that
// still read process.env keep working while they are threaded through the tenant
// registry. new code resolves a tenant (getTenantStore().get(id)) and calls
// dfnsClientFor(tenant). the singleton that used to live here is gone; the
// per-tenant factory owns client construction and caching now, and this delegates
// to it with the env-sourced demo tenant so behavior is unchanged.
export function getDfnsClient(): DfnsApiClient {
  return dfnsClientFor(requireDemoTenant())
}

// listing one wallet is the lightest authenticated call. fail-fast on
// boot lets a bad PEM or stale token error out before traffic arrives.
export async function pingDfns(): Promise<void> {
  await getDfnsClient().wallets.listWallets({ query: { limit: 1 } })
}
