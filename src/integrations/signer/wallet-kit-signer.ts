import { StellarWalletsKit } from '@creit-tech/stellar-wallets-kit'

import type { Signer, SignOpts } from './types'

export const walletKitSigner: Signer = {
  name: 'wallet-kit',
  async signTransaction(xdr: string, opts: SignOpts) {
    const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, opts)
    return { signedTxXdr }
  },
}
