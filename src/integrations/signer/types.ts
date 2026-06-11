// shared signer shape so wallet kit and dfns mpc swap through the same
// call site. matches stellarwalletkit.signTransaction(xdr, opts) for parity.

export interface SignOpts {
  networkPassphrase: string
  address: string
}

export interface Signer {
  signTransaction(xdr: string, opts: SignOpts): Promise<{ signedTxXdr: string }>
  readonly name: 'wallet-kit' | 'dfns'
}
