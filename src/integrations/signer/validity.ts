import { WALLET_CONNECT_ID } from '@creit-tech/stellar-wallets-kit/modules/wallet-connect'

// How long a transaction stays valid once built. An on-chain quorum, or the DFNS relay, collect
// approvals for up to an hour. A wallet reached over WalletConnect (a DFNS treasury first) may
// hold the signature for an approval of its own, and WalletConnect waits five minutes for the
// answer: built for a minute, the envelope expired before the approval came back. Any other
// wallet signs at once
export const QUORUM_VALIDITY_SECS = 3600
export const WALLETCONNECT_VALIDITY_SECS = 600
export const DIRECT_VALIDITY_SECS = 60

export function validitySecs({ quorum, walletId }: { quorum: boolean; walletId: string | null | undefined }): number {
  if (quorum) return QUORUM_VALIDITY_SECS
  if (walletId === WALLET_CONNECT_ID) return WALLETCONNECT_VALIDITY_SECS
  return DIRECT_VALIDITY_SECS
}

export const overWalletConnect = (walletId: string | null | undefined) => walletId === WALLET_CONNECT_ID
