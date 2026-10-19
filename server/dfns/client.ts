import type { DfnsApiClient } from '@dfns/sdk'

import { dfnsClientFor } from '../tenants/client'
import { requireDemoTenant } from '../tenants/demo'

export function getDfnsClient(): DfnsApiClient {
  return dfnsClientFor(requireDemoTenant())
}

// listing one wallet is the lightest authenticated call.
export async function pingDfns(): Promise<void> {
  await getDfnsClient().wallets.listWallets({ query: { limit: 1 } })
}
