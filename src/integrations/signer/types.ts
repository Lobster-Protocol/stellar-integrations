export interface SignOpts {
  networkPassphrase: string
  address: string
}

export interface SignResult {
  // a signed envelope the caller submits itself (wallet kit; or dfns when it
  // only signs a soroban tx).
  signedTxXdr?: string
  // a tx hash for a tx the signer already broadcast (dfns signs AND broadcasts
  // a classic tx natively), so the caller uses the hash instead of submitting.
  broadcastHash?: string
}

export interface Signer {
  signTransaction(xdr: string, opts: SignOpts): Promise<SignResult>
  readonly name: 'wallet-kit' | 'dfns'
}
