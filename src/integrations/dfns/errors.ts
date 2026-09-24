// Turn a raw DFNS / relay / Stellar error into one sentence the user can act on.
// The relay and the signer hand back codes like "txMalformed" or a JSON blob,
// which tell the user nothing. Same idea as readableSwapError in SwapModal.
export function readableDfnsError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('malformed')) {
    return 'DFNS could not broadcast this transaction. That usually means it was built for a different network than the DFNS wallet, or a Soroban action DFNS cannot sign over WalletConnect. Try the browser wallet for this action, or tell us what you were doing.'
  }
  if (m.includes('bad_seq') || m.includes('badseq')) {
    return 'The account moved on since this was prepared. Start it again.'
  }
  if (m.includes('too_late') || m.includes('toolate')) {
    return 'This took too long to reach the network and expired. Start it again.'
  }
  if (m.includes('insufficient') && m.includes('fee')) {
    return 'The network fee was too low for current conditions. Try again.'
  }
  if (m.includes('rejected') || m.includes('denied')) {
    return 'An approval policy in DFNS declined this request.'
  }
  // demo-tx already throws a clear, actionable sentence for an unfunded wallet
  if (m.includes('not funded') || m.includes('friendbot')) return message
  // a JSON blob or a stack: keep the first line only, trimmed
  return message.split('\n')[0].slice(0, 180)
}
