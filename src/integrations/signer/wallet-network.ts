import { StellarWalletsKit } from '@creit-tech/stellar-wallets-kit'

// the passphrase the connected wallet is set to, or null when it can't be read.
// callers compare it against the app network to warn before the wallet's own
// signing block ("set to Main Net").
export async function getWalletNetworkPassphrase(): Promise<string | null> {
  try {
    const res = await StellarWalletsKit.getNetwork()
    return res?.networkPassphrase || null
  } catch {
    return null
  }
}
