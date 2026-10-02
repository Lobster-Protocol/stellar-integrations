import { http, fallback, createConfig } from 'wagmi'
import { mainnet, arbitrum, bsc, base, sepolia, baseSepolia, arbitrumSepolia } from 'wagmi/chains'
import { connectorsForWallets, type Wallet, type WalletList } from '@rainbow-me/rainbowkit'
import {
  coinbaseWallet,
  injectedWallet,
  ledgerWallet,
  metaMaskWallet,
  okxWallet,
  rabbyWallet,
  rainbowWallet,
  safeWallet,
  trustWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets'

import { cctpChain, type Network } from '../../config/contracts'

const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined

// Any wallet that speaks WalletConnect, by QR code. It is RainbowKit's own WalletConnect
// entry, made by the same module as the other wallets so that all of them share a single
// WalletConnect client. Under another id, RainbowKit leaves out WalletConnect's official
// modal, a second Reown AppKit that would sit next to the Stellar kit's one and share the
// page's custom elements and state with it.
function anyWalletConnect(params: Parameters<typeof walletConnectWallet>[0]): Wallet {
  return { ...walletConnectWallet(params), id: 'walletconnect-qr' }
}

// Whatever wallet the browser carries, offered only when it carries one: RainbowKit lists
// it in any browser, and in one without a wallet picking it fails.
function browserWallet(): Wallet {
  const hasOne = typeof window !== 'undefined' && !!(window as { ethereum?: unknown }).ethereum
  return { ...injectedWallet(), installed: hasOne }
}

// One window for every EVM wallet: the extensions in this browser show up on their own
// (EIP-6963), the others connect by deep link or QR code. Without a WalletConnect project
// id only the ones that need no WalletConnect are offered.
const walletList: WalletList = projectId
  ? [
      {
        groupName: 'Popular',
        wallets: [metaMaskWallet, coinbaseWallet, rabbyWallet, trustWallet, ledgerWallet, rainbowWallet, okxWallet, safeWallet, anyWalletConnect, browserWallet],
      },
    ]
  : [{ groupName: 'In this browser', wallets: [browserWallet, rabbyWallet, coinbaseWallet, safeWallet] }]

const origin = typeof window === 'undefined' ? undefined : window.location.origin

const connectors = connectorsForWallets(walletList, {
  appName: 'Lobster Protocol',
  appDescription: 'Lobster Protocol dashboard',
  appUrl: origin,
  appIcon: origin && `${origin}/lobster-icon.png`,
  projectId: projectId ?? '',
  // its own storage, apart from the Stellar kit's WalletConnect client: two clients on the
  // same keys overwrite each other's sessions
  walletConnectParameters: { customStoragePrefix: 'lobster-evm' },
})

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
  // viem's default for Ethereum, eth.merkle.io, sends no CORS header, so every CCTP
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
