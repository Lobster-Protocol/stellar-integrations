import { StellarWalletsKit } from '@creit-tech/stellar-wallets-kit'

// null when the wallet can't say. read up front so a mismatch is flagged before the
// wallet blocks the signature on its own ("set to Main Net").
export async function getWalletNetworkPassphrase(): Promise<string | null> {
  try {
    const res = await StellarWalletsKit.getNetwork()
    return res?.networkPassphrase || null
  } catch {
    return null
  }
}
