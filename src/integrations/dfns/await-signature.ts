import { pollSignatureResult } from './relay'
import { submitSignedXdr, waitForTx } from '../lobster/factory'
import type { Network } from '../lobster/types'

// Waits out a held dfns signature and returns the on-chain hash. A classic tx
// comes back as a hash dfns already broadcast; a soroban tx comes back as a signed
// envelope this submits through rpc, so the caller gets a hash either way. The
// approval is a human step in the dfns console, so the wait is deliberately wide.
export async function awaitDfnsSignature(
  pendingId: string,
  network: Network,
  signal?: AbortSignal,
): Promise<string> {
  const result = await pollSignatureResult(pendingId, { signal })
  if ('txHash' in result) return result.txHash
  const hash = await submitSignedXdr(network, result.signedTxXdr)
  const final = await waitForTx(network, hash)
  if (final.status !== 'SUCCESS') throw new Error(`the network reported ${final.status}`)
  return hash
}
