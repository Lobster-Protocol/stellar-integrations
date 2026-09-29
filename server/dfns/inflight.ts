// one treasury signature at a time: a tx built while another waits for approval
// carries the same sequence, and whichever dfns broadcasts second gets tx_bad_seq.
const pending = new Map<string, string>()

// a stale entry, from a client that never polled, clears here on the next attempt.
// statusOf and isTerminal are injected to keep this free of the dfns client.
export async function unresolvedSignature(
  walletId: string,
  statusOf: (walletId: string, id: string) => Promise<{ status: string }>,
  isTerminal: (status: string) => boolean,
): Promise<string | null> {
  const id = pending.get(walletId)
  if (!id) return null
  const { status } = await statusOf(walletId, id)
  if (isTerminal(status)) {
    pending.delete(walletId)
    return null
  }
  return id
}

export function trackPending(walletId: string, id: string): void {
  pending.set(walletId, id)
}

export function clearPending(walletId: string): void {
  pending.delete(walletId)
}

// a status route checks a read is about the in-flight signature before it releases
// the lock, so a terminal read of some other id cannot clear one still held.
export function peekPending(walletId: string): string | null {
  return pending.get(walletId) ?? null
}
