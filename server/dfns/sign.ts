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

export async function getSignatureStatus(
  walletId: string,
  txId: string,
): Promise<DfnsSignatureResponse> {
  const dfns = getDfnsClient()
  const res = await dfns.wallets.getTransaction({ walletId, transactionId: txId })
  return DfnsSignatureSchema.parse(res)
}

// broadcasted can still fail on chain; rejected is a policy refusing the request.
export function isTerminal(status: string): boolean {
  return status === 'Confirmed' || status === 'Failed' || status === 'Rejected'
}

// returns the last status on timeout rather than throwing: a tx held by an approval
// policy stays non-terminal and the caller hands its id to the client to poll.
export async function waitForSignatureTerminal(
  walletId: string,
  txId: string,
  timeoutMs = POLL_TIMEOUT_MS,
): Promise<DfnsSignatureResponse> {
  const start = Date.now()
  let cur = await getSignatureStatus(walletId, txId)
  while (!isTerminal(cur.status) && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    cur = await getSignatureStatus(walletId, txId)
  }
  return cur
}

// when dfns returns a signed envelope instead of a hash, the client submits it
// through its own rpc.
export function envelopeFromSignedData(
  signedDataHex: string,
  networkPassphrase: string,
): Transaction | FeeBumpTransaction {
  const clean = signedDataHex.startsWith('0x') ? signedDataHex.slice(2) : signedDataHex
  const b64 = Buffer.from(clean, 'hex').toString('base64')
  return TransactionBuilder.fromXDR(b64, networkPassphrase) as Transaction | FeeBumpTransaction
}
