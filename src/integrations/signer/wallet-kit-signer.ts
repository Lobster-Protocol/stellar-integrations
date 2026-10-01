import { StellarWalletsKit } from '@creit-tech/stellar-wallets-kit'
import { Networks } from '@stellar/stellar-sdk'

import type { Signer, SignOpts } from './types'

const networkName = (passphrase: string) =>
  passphrase === Networks.PUBLIC ? 'Mainnet' : passphrase === Networks.TESTNET ? 'Testnet' : 'another network'

// the kit reports a wallet on the other network as "The user rejected this request";
// one that cannot say which network it is on is left to sign or refuse
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

// a read-only view borrows an address that no wallet here holds, so nothing goes to
// the kit while one is open, whatever screen asks
let viewing: string | null = null

export function setViewingAddress(address: string | null) {
  viewing = address
}

export const walletKitSigner: Signer = {
  name: 'wallet-kit',
  async signTransaction(xdr: string, opts: SignOpts) {
    if (viewing) {
      throw new Error(
        `This is a read-only view of ${viewing.slice(0, 4)}...${viewing.slice(-4)}. ` +
          'Leave it and connect a wallet to sign.',
      )
    }
    await assertSameNetwork(opts.networkPassphrase)
    try {
      const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, opts)
      return { signedTxXdr }
    } catch (err) {
      // the kit rejects with a bare string or a { code, message } object, and a caller
      // checking instanceof Error would show "Something went wrong" for a plain decline
      if (err instanceof Error) throw err
      if (typeof err === 'string' && err) throw new Error(err)
      const message = (err as { message?: unknown } | null)?.message
      throw new Error(typeof message === 'string' && message ? message : 'The wallet did not sign')
    }
  },
}
