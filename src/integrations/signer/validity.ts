import { WALLET_CONNECT_ID } from '@creit-tech/stellar-wallets-kit/modules/wallet-connect'

// a quorum or the DFNS relay can take up to an hour to collect approvals; WalletConnect
// waits five minutes on a wallet that may hold the signature for its own approval, others
// sign at once
export const QUORUM_VALIDITY_SECS = 3600
export const WALLETCONNECT_VALIDITY_SECS = 600
export const DIRECT_VALIDITY_SECS = 60

export const overWalletConnect = (walletId: string | null | undefined) => walletId === WALLET_CONNECT_ID

// same rule for a flow that has its own window when signed at once (swap deadline, bridge step)
export function windowSecs({ quorum, walletId, base }: { quorum: boolean; walletId: string | null | undefined; base: number }): number {
  if (quorum) return QUORUM_VALIDITY_SECS
  if (overWalletConnect(walletId)) return Math.max(base, WALLETCONNECT_VALIDITY_SECS)
  return base
}

export function validitySecs({ quorum, walletId }: { quorum: boolean; walletId: string | null | undefined }): number {
  return windowSecs({ quorum, walletId, base: DIRECT_VALIDITY_SECS })
}
