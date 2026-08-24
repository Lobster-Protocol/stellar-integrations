// One treasury signature at a time. Two txs built against the same account
// sequence while one waits for approval both carry that sequence; whichever dfns
// broadcasts second gets tx_bad_seq. Rejecting a new sign while a prior one is
// still unresolved keeps the treasury to a single in-flight tx, so the re-fetched
// sequence cannot collide with a held one.
const pending = new Map<string, string>()

// returns the id of a prior signature still awaiting approval, or null. clears
// the tracker when that prior one has reached a terminal state, so a stale entry
// (a client that never polled) self-heals on the next attempt. statusOf and
// isTerminal are injected to keep this free of the dfns client for testing.
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
