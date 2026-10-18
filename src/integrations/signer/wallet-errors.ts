// WalletConnect gives up after five minutes with a bare "Request expired", nothing signed or sent
export function walletAnswerText(message: string): string | null {
  if (/request expired/i.test(message)) {
    return 'Your wallet did not answer within five minutes, so nothing was signed or sent. A DFNS wallet holds a signature until it is approved: approve it sooner, or check that its policy lets someone other than you approve.'
  }
  return null
}
