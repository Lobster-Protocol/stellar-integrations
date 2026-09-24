import { http, createConfig } from 'wagmi'
import { mainnet, arbitrum, bsc, base, sepolia, baseSepolia, arbitrumSepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

import { cctpChain } from '../../config/contracts'

// The EVM bridge connects with injected wallets only (MetaMask, Rabby). We deliberately
// do NOT add wagmi's walletConnect connector: it starts a second WalletConnect Core next
// to the Stellar Wallets Kit's WC module (same project id), and two cores clobber each
// other's session state - which broke DFNS-over-WalletConnect signing (the sign request
// could not find its session, so a swap hung on "Awaiting signature"). One WC core, on the
// Stellar side, where DFNS custody lives.
const connectors = [injected({ shimDisconnect: true })]

// wagmi only switches to chains listed here, so every CCTP source chain is,
// Sepolia testnets included
export const wagmiConfig = createConfig({
  chains: [mainnet, arbitrum, bsc, base, sepolia, baseSepolia, arbitrumSepolia],
  connectors,
  transports: {
    [mainnet.id]: http(import.meta.env.VITE_ETH_RPC || undefined),
    [arbitrum.id]: http(import.meta.env.VITE_ARB_RPC || undefined),
    [bsc.id]: http(import.meta.env.VITE_BSC_RPC || undefined),
    [base.id]: http(import.meta.env.VITE_BASE_RPC || cctpChain('mainnet', 'BASE').rpcFallback),
    [sepolia.id]: http(import.meta.env.VITE_SEPOLIA_RPC || cctpChain('testnet', 'ETH').rpcFallback),
    [baseSepolia.id]: http(
      import.meta.env.VITE_BASE_SEPOLIA_RPC || cctpChain('testnet', 'BASE').rpcFallback,
    ),
    [arbitrumSepolia.id]: http(
      import.meta.env.VITE_ARB_SEPOLIA_RPC || cctpChain('testnet', 'ARB').rpcFallback,
    ),
  },
})

// narrows a registry chain id to what switchChain and writeContract accept
export type WagmiChainIdAny = (typeof wagmiConfig)['chains'][number]['id']

export function isConfiguredChainId(id: number): id is WagmiChainIdAny {
  return wagmiConfig.chains.some((c) => c.id === id)
}


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
