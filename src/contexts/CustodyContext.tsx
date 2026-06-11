import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import type { Signer } from '../integrations/signer/types'
import { walletKitSigner } from '../integrations/signer/wallet-kit-signer'
import { dfnsSigner } from '../integrations/signer/dfns-signer'
import { useDfnsWallets } from '../integrations/dfns/hooks'
import { useNetwork } from './NetworkContext'
import { isAccountId } from '../integrations/stellar/strkey-guards'

export type CustodyMode = 'wallet-kit' | 'dfns'

interface CustodyCtx {
  mode: CustodyMode
  setMode: (m: CustodyMode) => void
  signer: Signer
  // first dfns wallet that matches the active network, null when in
  // wallet-kit mode or when no matching wallet is configured yet.
  dfnsAddress: string | null
}

const Ctx = createContext<CustodyCtx | null>(null)
const STORAGE_KEY = 'lob_custody_mode'

function readInitial(): CustodyMode {
  if (typeof window === 'undefined') return 'wallet-kit'
  const v = localStorage.getItem(STORAGE_KEY)
  return v === 'dfns' ? 'dfns' : 'wallet-kit'
}

export function CustodyProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<CustodyMode>(readInitial)
  const { network } = useNetwork()
  const wallets = useDfnsWallets()

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode)
  }, [mode])

  const dfnsAddress = useMemo(() => {
    if (mode !== 'dfns') return null
    const target = network === 'mainnet' ? 'Stellar' : 'StellarTestnet'
    const match = wallets.data?.items.find((w) => w.network === target && isAccountId(w.address))
    return match?.address ?? null
  }, [mode, network, wallets.data])

  const value = useMemo<CustodyCtx>(
    () => ({
      mode,
      setMode,
      signer: mode === 'dfns' ? dfnsSigner : walletKitSigner,
      dfnsAddress,
    }),
    [mode, dfnsAddress],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCustody() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useCustody must be used inside <CustodyProvider>')
  return v
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSigner(): Signer {
  return useCustody().signer
}
