import { createContext, useContext, useState, type ReactNode } from 'react'

type Network = 'testnet' | 'mainnet'

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
  const [network, setNet] = useState<Network>(
    () => (localStorage.getItem('lob_network') as Network) || 'testnet'
  )
  // console.log('network:', network)

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

export function useNetwork() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('wrap with <NetworkProvider>')
  return ctx
}
