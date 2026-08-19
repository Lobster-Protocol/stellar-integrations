import { StellarWalletsKit } from '@creit-tech/stellar-wallets-kit'

// the network passphrase the connected wallet is currently set to, or null when
// it cannot be read (no wallet attached yet, wallet locked, or a module that
// does not expose it). a wallet on a different network than the app refuses to
// sign, so the swap modal reads this to warn before the user hits the wallet's
// own cryptic "set to Main Net" block.
export async function getWalletNetworkPassphrase(): Promise<string | null> {
  try {
    const res = await StellarWalletsKit.getNetwork()
    return res?.networkPassphrase || null
  } catch {
    return null
  }
}
