import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Network } from '../config/contracts'

interface NetworkCtx {
  network: Network
  setNetwork: (n: Network) => void
  rpcUrl: string
  passphrase: string
}

const NETWORKS = {
  testnet: {
    rpc: 'https://soroban-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
  },
  mainnet: {
    rpc: 'https://mainnet.sorobanrpc.com',
    passphrase: 'Public Global Stellar Network ; September 2015',
  },
} as const

const Ctx = createContext<NetworkCtx | null>(null)

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [network, setNet] = useState<Network>(() => {
    const stored = localStorage.getItem('lob_network')
    // anything else (corrupted localStorage, old builds) falls back to testnet
    return stored === 'mainnet' || stored === 'testnet' ? stored : 'testnet'
  })

  const handleSetNetwork = (n: Network) => {
    setNet(n)
    localStorage.setItem('lob_network', n)
  }

  const cfg = NETWORKS[network]

  return (
    <Ctx.Provider value={{ network, setNetwork: handleSetNetwork, rpcUrl: cfg.rpc, passphrase: cfg.passphrase }}>
      {children}
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useNetwork() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('wrap with <NetworkProvider>')
  return ctx
}
