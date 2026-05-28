import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Network } from '../config/contracts'

interface NetworkCtx {
  network: Network
  setNetwork: (n: Network) => void
}

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

  return (
    <Ctx.Provider value={{ network, setNetwork: handleSetNetwork }}>
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
