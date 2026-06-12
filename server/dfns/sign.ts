import { TransactionBuilder, type Transaction, type FeeBumpTransaction } from '@stellar/stellar-sdk'

import { getDfnsClient } from './client'
import { DfnsSignatureSchema, type DfnsSignatureResponse } from './types'

const POLL_INTERVAL_MS = 2_000
const POLL_TIMEOUT_MS = 120_000

function toHexEnvelope(tx: Transaction | FeeBumpTransaction): string {
  return `0x${tx.toEnvelope().toXDR('hex')}`
}

// dfns wants the unsigned envelope as hex with a 0x prefix. base64 is
// silently rejected with a confusing error, so the hex form is enforced.
export async function broadcastStellarTx(
  walletId: string,
  tx: Transaction | FeeBumpTransaction,
): Promise<DfnsSignatureResponse> {
  const dfns = getDfnsClient()
  const res = await dfns.wallets.broadcastTransaction({
    walletId,
    body: { kind: 'Transaction', transaction: toHexEnvelope(tx) },
  })
  return DfnsSignatureSchema.parse(res)
}

async function getTransactionStatus(
  walletId: string,
  txId: string,
): Promise<DfnsSignatureResponse> {
  const dfns = getDfnsClient()
  const res = await dfns.wallets.getTransaction({ walletId, transactionId: txId })
  return DfnsSignatureSchema.parse(res)
}

// poll until the signature reaches a terminal state. throws on timeout.
// confirmed != broadcasted: policies can reject between submit and chain.
export async function waitForSignatureTerminal(
  walletId: string,
  txId: string,
): Promise<DfnsSignatureResponse> {
  const start = Date.now()
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const cur = await getTransactionStatus(walletId, txId)
    if (['Confirmed', 'Failed', 'Rejected'].includes(cur.status)) return cur
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  throw new Error(`dfns signature ${txId} did not reach terminal status within ${POLL_TIMEOUT_MS}ms`)
}

// reconstruct a signed envelope from the hex string dfns returns. the
// caller submits this through their own horizon/soroban-rpc, useful for
// soroban tx submission which dfns does not handle natively.
export function envelopeFromSignedData(
  signedDataHex: string,
  networkPassphrase: string,
): Transaction | FeeBumpTransaction {
  const clean = signedDataHex.startsWith('0x') ? signedDataHex.slice(2) : signedDataHex
  const b64 = Buffer.from(clean, 'hex').toString('base64')
  return TransactionBuilder.fromXDR(b64, networkPassphrase) as Transaction | FeeBumpTransaction
}
