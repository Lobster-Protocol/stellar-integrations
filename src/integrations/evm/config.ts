import { http, createConfig } from 'wagmi'
import { mainnet, arbitrum, bsc } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

// The EVM bridge connects with injected wallets only (MetaMask, Rabby). We deliberately
// do NOT add wagmi's walletConnect connector: it starts a second WalletConnect Core next
// to the Stellar Wallets Kit's WC module (same project id), and two cores clobber each
// other's session state - which broke DFNS-over-WalletConnect signing (the sign request
// could not find its session, so a swap hung on "Awaiting signature"). One WC core, on the
// Stellar side, where DFNS custody lives.
const connectors = [injected({ shimDisconnect: true })]

export const wagmiConfig = createConfig({
  chains: [mainnet, arbitrum, bsc],
  connectors,
  transports: {
    [mainnet.id]: http(import.meta.env.VITE_ETH_RPC || undefined),
    [arbitrum.id]: http(import.meta.env.VITE_ARB_RPC || undefined),
    [bsc.id]: http(import.meta.env.VITE_BSC_RPC || undefined),
  },
})

// EVM WalletConnect is intentionally not offered (see above); the bridge is injected-only.
// The DepositModal reads this to point a user with no extension at a browser wallet.
export const hasWalletConnectProjectId = false

export const EVM_CHAIN_ID = {
  ETH: mainnet.id,
  ARB: arbitrum.id,
  BSC: bsc.id,
} as const

export type EvmChainSymbol = keyof typeof EVM_CHAIN_ID

declare module 'wagmi' {
  interface Register {
    config: typeof wagmiConfig
  }
}
