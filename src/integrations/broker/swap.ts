import { TransactionBuilder, type TransactionI } from '@stellar/stellar-sdk'

import { getBrokerClient } from './client'
import type { Signer } from '../signer/types'
import { inspectBrokerTx, BrokerTxRejected } from './chain-guard'
import type { BrokerQuoteParams } from './types'

export type OnSignedHash = (hash: string) => void

// only transactions get signed. the broker's soroban leg arrives with no toXDR,
// as the bare sha-256 digest of the auth preimage, and a digest tells us nothing
// about what it authorizes. no sep-43 wallet could sign it right anyway (they
// hash their input, so the digest gets hashed twice). those quotes fall back to
// the direct dex path. onHash fires for each signed tx so the caller can log the
// broker-side hash, which the sdk does not expose itself.
export function makeAuthCallback(
  account: string,
  networkPassphrase: string,
  signer: Signer,
  onHash?: OnSignedHash,
  maxSpendStroops?: bigint,
) {
  return async (payload: TransactionI | Buffer): Promise<TransactionI | Buffer> => {
    if (!('toXDR' in payload)) {
      throw new BrokerTxRejected(
        'broker asked for a blind signature over an auth digest; use the direct dex path for soroban routes',
      )
    }

    const xdr = payload.toXDR()
    inspectBrokerTx(xdr, account, networkPassphrase, maxSpendStroops)
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
  params: BrokerQuoteParams,
  onHash?: OnSignedHash,
  maxSpendStroops?: bigint,
): Promise<void> {
  const client = await getBrokerClient()

  // the server only confirms a quote it issued on this socket, so re-quote
  // here; the ui estimate went over plain https and left no session behind.
  // keep the tolerance the trader saw, the sdk falls back to 0.02 without it.
  client.quote({
    sellingAsset: params.sellingAsset,
    buyingAsset: params.buyingAsset,
    sellingAmount: params.sellingAmount,
    ...(params.slippageTolerance !== undefined && { slippageTolerance: params.slippageTolerance }),
  })

  // the fresh quote comes back as a socket event, so confirm from there;
  // confirming right after quote() would race an empty lastQuote
  client.once('quote', () => {
    client.confirmQuote(account, makeAuthCallback(account, networkPassphrase, signer, onHash, maxSpendStroops))
  })
}
