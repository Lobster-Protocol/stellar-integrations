export interface SignOpts {
  networkPassphrase: string
  address: string
}

export interface Signer {
  signTransaction(xdr: string, opts: SignOpts): Promise<{ signedTxXdr: string }>
  readonly name: 'wallet-kit' | 'dfns'
}
