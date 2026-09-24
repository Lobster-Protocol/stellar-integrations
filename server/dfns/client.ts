import type { DfnsApiClient } from '@dfns/sdk'

import { dfnsClientFor } from '../tenants/client'
import { requireDemoTenant } from '../tenants/demo'

// the demo tenant's dfns client, built and cached by the per-tenant factory.
export function getDfnsClient(): DfnsApiClient {
  return dfnsClientFor(requireDemoTenant())
}

// listing one wallet is the lightest authenticated call. fail-fast on
// boot lets a bad PEM or stale token error out before traffic arrives.
export async function pingDfns(): Promise<void> {
  await getDfnsClient().wallets.listWallets({ query: { limit: 1 } })
}
