import { createContext, useContext, useState, type ReactNode } from 'react'
import type { Network } from '../config/contracts'

interface NetworkCtx {
  network: Network
  setNetwork: (n: Network) => void
}

const Ctx = createContext<NetworkCtx | null>(null)

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [network, setNet] = useState<Network>(() => {
    // ?network= from a shared link sticks, same as the toggle
    const linked = new URLSearchParams(window.location.search).get('network')
    if (linked === 'mainnet' || linked === 'testnet') {
      localStorage.setItem('lob_network', linked)
      return linked
    }
    const stored = localStorage.getItem('lob_network')
    return stored === 'mainnet' || stored === 'testnet' ? stored : 'testnet'
  })

  return (
    <Ctx.Provider
      value={{
        network,
        setNetwork: (n: Network) => {
          setNet(n)
          localStorage.setItem('lob_network', n)
        },
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- hook and provider share a file
export function useNetwork() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('wrap with <NetworkProvider>')
  return ctx
}
