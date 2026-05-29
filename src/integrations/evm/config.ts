import { http, createConfig } from 'wagmi'
import { mainnet, arbitrum, bsc } from 'wagmi/chains'
import { injected, walletConnect } from 'wagmi/connectors'

// Same projectId we use for LOBSTR mobile via Stellar Wallets Kit.
// Empty in dev means: no WalletConnect, MetaMask-injected only.
const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined

const connectors = [
  injected({ shimDisconnect: true }),
  ...(projectId
    ? [
        walletConnect({
          projectId,
          showQrModal: true,
          metadata: {
            name: 'Lobster Protocol',
            description: 'Lobster Protocol dashboard',
            url:
              typeof window !== 'undefined'
                ? window.location.origin
                : 'https://stellar-instit.lobster-protocol.com',
            icons: ['https://stellar-instit.lobster-protocol.com/lobster-icon.png'],
          },
        }),
      ]
    : []),
]

export const wagmiConfig = createConfig({
  chains: [mainnet, arbitrum, bsc],
  connectors,
  transports: {
    [mainnet.id]: http(import.meta.env.VITE_ETH_RPC || undefined),
    [arbitrum.id]: http(import.meta.env.VITE_ARB_RPC || undefined),
    [bsc.id]: http(import.meta.env.VITE_BSC_RPC || undefined),
  },
})

export const hasWalletConnectProjectId = !!projectId

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
