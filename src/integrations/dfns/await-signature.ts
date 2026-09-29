import { pollSignatureResult } from './relay'
import { submitSignedXdr, waitForTx } from '../lobster/factory'
import type { Network } from '../lobster/types'

// a soroban envelope is submitted here, so the caller gets a hash either way.
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
