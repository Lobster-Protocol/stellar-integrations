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
  } catch {
    // account missing or network blip - treat as no trustline
    return false
  }
}
