export interface SignOpts {
  networkPassphrase: string
  address: string
}

export interface SignResult {
  // for the caller to submit (wallet kit, or dfns on a soroban tx)
  signedTxXdr?: string
  // dfns signs and broadcasts a classic tx itself, so there is nothing to submit
  broadcastHash?: string
  // a dfns signature held for approval; the caller polls it for the hash
  pendingId?: string
}

export interface Signer {
  signTransaction(xdr: string, opts: SignOpts): Promise<SignResult>
  readonly name: 'wallet-kit' | 'dfns'
}
