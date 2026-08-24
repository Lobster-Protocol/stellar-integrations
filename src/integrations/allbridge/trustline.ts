import { Asset, Operation, TransactionBuilder, BASE_FEE, NotFoundError } from '@stellar/stellar-sdk'
import { getHorizonServer } from '../horizon/client'
import { networkPassphrase } from '../lobster/client'
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
    if (err instanceof NotFoundError) return false
    throw err
  }
}

// without this trustline any bridged USDC bounces back to the source chain.
export async function buildTrustlineXdr(
  accountId: string,
  assetCode: string,
  assetIssuer: string,
  network: Network,
): Promise<string> {
  const server = getHorizonServer(network)
  const account = await server.loadAccount(accountId)
  return new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase(network),
  })
    .addOperation(Operation.changeTrust({ asset: new Asset(assetCode, assetIssuer) }))
    .setTimeout(180)
    .build()
    .toXDR()
}

export async function submitTrustlineTx(signedXdr: string, network: Network): Promise<string> {
  const server = getHorizonServer(network)
  const tx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase(network))
  const res = await server.submitTransaction(tx)
  return res.hash
}
