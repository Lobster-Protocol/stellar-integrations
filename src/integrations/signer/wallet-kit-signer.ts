import { StellarWalletsKit } from '@creit-tech/stellar-wallets-kit'

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

export const walletKitSigner: Signer = {
  name: 'wallet-kit',
  async signTransaction(xdr: string, opts: SignOpts) {
    try {
      const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, opts)
      return { signedTxXdr }
    } catch (err) {
      throw asError(err)
    }
  },
}
