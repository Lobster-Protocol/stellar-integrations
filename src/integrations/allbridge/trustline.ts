// Stellar trustline helpers for the Allbridge destination side.
// Allbridge SDK doesn't handle the trustline for us, so we check it
// ourselves and build the changeTrust XDR if it's missing.

import {
  TransactionBuilder,
  Operation,
  Asset,
  BASE_FEE,
} from '@stellar/stellar-sdk'

import { getHorizonServer } from '../horizon/client'
import { networkPassphrase } from '../lobster/client'
import type { Network } from '../lobster/types'

export const STELLAR_TIMEOUT_SECONDS = 60

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

export async function buildTrustlineXdr(
  accountId: string,
  assetCode: string,
  assetIssuer: string,
  network: Network,
): Promise<string> {
  const server = getHorizonServer(network)
  const account = await server.loadAccount(accountId)
  const asset = new Asset(assetCode, assetIssuer)

  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase(network),
  })
    .addOperation(Operation.changeTrust({ asset }))
    .setTimeout(STELLAR_TIMEOUT_SECONDS)
    .build()

  return tx.toXDR()
}

export async function submitSignedXdr(
  signedXdr: string,
  network: Network,
): Promise<{ hash: string; ledger: number }> {
  const server = getHorizonServer(network)
  const tx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase(network))
  const result = await server.submitTransaction(tx)
  return { hash: result.hash, ledger: result.ledger }
}
