import { http, createConfig } from 'wagmi'
import { mainnet, arbitrum, bsc, base, sepolia, baseSepolia, arbitrumSepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

import { cctpChain } from '../../config/contracts'

// injected wallets only: a wagmi walletConnect connector would start a second WC core next
// to the Stellar kit's (same project id), and the two overwrite each other's sessions
const connectors = [injected({ shimDisconnect: true })]

// wagmi only switches to chains listed here, so every CCTP source chain is,
// Sepolia testnets included
export const wagmiConfig = createConfig({
  chains: [mainnet, arbitrum, bsc, base, sepolia, baseSepolia, arbitrumSepolia],
  connectors,
  // viem's own default for Ethereum, eth.merkle.io, sends no CORS header, so a
  // browser could not read a balance or wait for a receipt there. Every CCTP
  // source chain falls back to the endpoint in the registry instead
  transports: {
    [mainnet.id]: http(import.meta.env.VITE_ETH_RPC || cctpChain('mainnet', 'ETH').rpcFallback),
    [arbitrum.id]: http(import.meta.env.VITE_ARB_RPC || cctpChain('mainnet', 'ARB').rpcFallback),
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
