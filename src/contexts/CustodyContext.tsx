import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import type { Signer } from '../integrations/signer/types'
import { walletKitSigner } from '../integrations/signer/wallet-kit-signer'
import { dfnsSigner } from '../integrations/signer/dfns-signer'
import { useDfnsWallets } from '../integrations/dfns/hooks'
import { useActiveProfile, useSelectedWallet } from '../integrations/dfns/use-profiles'
import type { DfnsNetwork } from '../integrations/dfns/profiles'
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
  const activeProfile = useActiveProfile()
  const target: DfnsNetwork = network === 'mainnet' ? 'Stellar' : 'StellarTestnet'
  const picked = useSelectedWallet(target)

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode)
  }, [mode])

  const dfnsAddress = useMemo(() => {
    if (mode !== 'dfns') return null
    // no dfns custody until a profile is connected. connecting a client relay
    // selects it; the demo is opt-in and never acts as custody on mainnet.
    if (!activeProfile) return null
    if (activeProfile.kind === 'demo' && network === 'mainnet') return null
    const items = wallets.data?.items ?? []
    // the operator's explicit pick wins, as long as the relay still reports it on
    // this network. otherwise fall back to the one wallet that matches.
    if (picked && items.some((w) => w.address === picked.address && w.network === target)) {
      return picked.address
    }
    const match = items.find((w) => w.network === target && isAccountId(w.address))
    return match?.address ?? null
  }, [mode, network, target, wallets.data, activeProfile, picked])

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
