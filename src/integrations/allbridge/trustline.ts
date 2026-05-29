// Stellar trustline check for the Allbridge destination side. The SDK
// doesn't expose this, so we ask Horizon ourselves.

import { getHorizonServer } from '../horizon/client'
import type { Network } from '../lobster/types'

export async function hasTrustline(
  accountId: string,
  assetCode: string,
  assetIssuer: string,
  network: Network,
): Promise<boolean> {
  const server = getHorizonServer(network)
  try {
    const account = await server.loadAccount(accountId)
    return account.balances.some((b) => {
      if (b.asset_type === 'native') return false
      const ab = b as { asset_code?: string; asset_issuer?: string }
      return ab.asset_code === assetCode && ab.asset_issuer === assetIssuer
    })
  } catch (err) {
    // 404 = account not yet on chain. Treat as no trustline so the UI
    // shows "Required" rather than an error toast. Anything else
    // (network outage, malformed account id) we rethrow so the caller
    // can render the failure state instead of silently saying "no".
    const status = (err as { response?: { status?: number } })?.response?.status
    if (status === 404) return false
    throw err
  }
}
