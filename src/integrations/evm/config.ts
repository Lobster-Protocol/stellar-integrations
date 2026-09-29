import { http, fallback, createConfig } from 'wagmi'
import { mainnet, arbitrum, bsc, base, sepolia, baseSepolia, arbitrumSepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'

import { cctpChain, type Network } from '../../config/contracts'

// injected wallets only: a wagmi walletConnect connector would start a second WC core next
// to the Stellar kit's (same project id), and the two overwrite each other's sessions
const connectors = [injected({ shimDisconnect: true })]

// an override first, then the registry's public endpoint, then one that keeps
// old receipts, each tried when the one before it fails
function sourceChainTransport(override: string | undefined, network: Network, key: string) {
  const { rpcFallback, rpcArchive } = cctpChain(network, key)
  const urls = [override, rpcFallback, rpcArchive].filter((u): u is string => !!u)
  return fallback(urls.map((u) => http(u)))
}

// wagmi only switches to chains listed here, so every CCTP source chain is,
// Sepolia testnets included
export const wagmiConfig = createConfig({
  chains: [mainnet, arbitrum, bsc, base, sepolia, baseSepolia, arbitrumSepolia],
  connectors,
  // viem's own default for Ethereum, eth.merkle.io, sends no CORS header, so a
  // browser could not read a balance or wait for a receipt there. Every CCTP
  // source chain falls back to the endpoint in the registry instead
  transports: {
    [mainnet.id]: sourceChainTransport(import.meta.env.VITE_ETH_RPC, 'mainnet', 'ETH'),
    [arbitrum.id]: sourceChainTransport(import.meta.env.VITE_ARB_RPC, 'mainnet', 'ARB'),
    [bsc.id]: http(import.meta.env.VITE_BSC_RPC || undefined),
    [base.id]: sourceChainTransport(import.meta.env.VITE_BASE_RPC, 'mainnet', 'BASE'),
    [sepolia.id]: sourceChainTransport(import.meta.env.VITE_SEPOLIA_RPC, 'testnet', 'ETH'),
    [baseSepolia.id]: sourceChainTransport(import.meta.env.VITE_BASE_SEPOLIA_RPC, 'testnet', 'BASE'),
    [arbitrumSepolia.id]: sourceChainTransport(import.meta.env.VITE_ARB_SEPOLIA_RPC, 'testnet', 'ARB'),
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
