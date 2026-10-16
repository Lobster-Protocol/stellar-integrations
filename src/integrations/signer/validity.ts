import { WALLET_CONNECT_ID } from '@creit-tech/stellar-wallets-kit/modules/wallet-connect'

// How long a transaction stays valid once built. An on-chain quorum, or the DFNS relay, collect
// approvals for up to an hour. A wallet reached over WalletConnect (a DFNS treasury first) may
// hold the signature for an approval of its own, and WalletConnect waits five minutes for the
// answer: built for a minute, the envelope expired before the approval came back. Any other
// wallet signs at once
export const QUORUM_VALIDITY_SECS = 3600
export const WALLETCONNECT_VALIDITY_SECS = 600
export const DIRECT_VALIDITY_SECS = 60

export const overWalletConnect = (walletId: string | null | undefined) => walletId === WALLET_CONNECT_ID

// the same rule for a flow that has a window of its own when signed at once: a swap's
// deadline, the three minutes of a bridge step
export function windowSecs({ quorum, walletId, base }: { quorum: boolean; walletId: string | null | undefined; base: number }): number {
  if (quorum) return QUORUM_VALIDITY_SECS
  if (overWalletConnect(walletId)) return Math.max(base, WALLETCONNECT_VALIDITY_SECS)
  return base
}

export function validitySecs({ quorum, walletId }: { quorum: boolean; walletId: string | null | undefined }): number {
  return windowSecs({ quorum, walletId, base: DIRECT_VALIDITY_SECS })
}
