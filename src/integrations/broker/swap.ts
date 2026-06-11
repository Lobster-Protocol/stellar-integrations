import { TransactionBuilder, type TransactionI } from '@stellar/stellar-sdk'

import { getBrokerClient } from './client'
import type { Signer } from '../signer/types'
import { inspectBrokerTx } from './chain-guard'

export type OnSignedHash = (hash: string) => void

// tx-source auth only. soroban entry preimages (Buffer payloads pushed by the
// broker for cross-contract authorizeEntry calls) need raw ed25519 signing
// that the wallet kit does not currently expose. when onHash is provided it
// is called for every signed leg with the tx hash hex, so the caller can
// log the broker-side hash (the broker sdk does not expose it itself).
export function makeSignCallback(
  account: string,
  networkPassphrase: string,
  signer: Signer,
  onHash?: OnSignedHash,
) {
  return async (payload: TransactionI | Buffer): Promise<TransactionI | Buffer> => {
    if (!('toXDR' in payload)) {
      throw new Error('soroban auth-entry signing not supported via wallet kit')
    }
    const xdr = payload.toXDR()
    inspectBrokerTx(xdr, account, networkPassphrase)
    const { signedTxXdr } = await signer.signTransaction(xdr, {
      networkPassphrase,
      address: account,
    })
    const signed = TransactionBuilder.fromXDR(signedTxXdr, networkPassphrase) as TransactionI
    if (onHash) {
      try {
        onHash(signed.hash().toString('hex'))
      } catch {
        // hash extraction is best-effort, never break the signing flow
      }
    }
    return signed
  }
}

export async function confirmBrokerTrade(
  account: string,
  networkPassphrase: string,
  signer: Signer,
  onHash?: OnSignedHash,
): Promise<void> {
  const client = await getBrokerClient()
  client.confirmQuote(account, makeSignCallback(account, networkPassphrase, signer, onHash))
}
