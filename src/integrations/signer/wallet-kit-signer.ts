import { StellarWalletsKit } from '@creit-tech/stellar-wallets-kit'
import { Networks } from '@stellar/stellar-sdk'

import type { Signer, SignOpts } from './types'

// The kit rejects with a bare string or a { code, message } object, not an
// Error, and callers checking `instanceof Error` would show "Something went
// wrong" when someone simply declined in their wallet.
function asError(err: unknown): Error {
  if (err instanceof Error) return err
  if (typeof err === 'string' && err) return new Error(err)
  const message = (err as { message?: unknown } | null)?.message
  return new Error(typeof message === 'string' && message ? message : 'The wallet did not sign')
}

const networkName = (passphrase: string) =>
  passphrase === Networks.PUBLIC ? 'Mainnet' : passphrase === Networks.TESTNET ? 'Testnet' : 'another network'

// A wallet set to the other network refuses the signature, and the kit reports
// that as "The user rejected this request", blaming the person for a setting.
// A wallet that cannot say which network it is on is left to sign or refuse.
async function assertSameNetwork(expected: string): Promise<void> {
  let current: string | undefined
  try {
    current = (await StellarWalletsKit.getNetwork()).networkPassphrase
  } catch {
    return
  }
  if (current && current !== expected) {
    throw new Error(
      `Your Stellar wallet is on ${networkName(current)} and this page is on ${networkName(expected)}. ` +
        `Switch the wallet to ${networkName(expected)}, then try again.`,
    )
  }
}

export const walletKitSigner: Signer = {
  name: 'wallet-kit',
  async signTransaction(xdr: string, opts: SignOpts) {
    await assertSameNetwork(opts.networkPassphrase)
    try {
      const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, opts)
      return { signedTxXdr }
    } catch (err) {
      throw asError(err)
    }
  },
}
