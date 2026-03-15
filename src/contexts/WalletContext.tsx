import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { StellarWalletsKit } from '@creit-tech/stellar-wallets-kit'
import { FreighterModule, FREIGHTER_ID } from '@creit-tech/stellar-wallets-kit/modules/freighter'
import { xBullModule, XBULL_ID } from '@creit-tech/stellar-wallets-kit/modules/xbull'
import { AlbedoModule, ALBEDO_ID } from '@creit-tech/stellar-wallets-kit/modules/albedo'

interface WalletCtx {
  address: string | null
  walletName: string | null
  connecting: boolean
  connect: (walletId?: string) => Promise<void>
  disconnect: () => void
  showPicker: boolean
  setShowPicker: (v: boolean) => void
}

const Ctx = createContext<WalletCtx | null>(null)

// TODO: add WalletConnect module for LOBSTR once we have a project ID
const WALLETS = [
  { id: FREIGHTER_ID, name: 'Freighter' },
  { id: XBULL_ID, name: 'xBull' },
  { id: ALBEDO_ID, name: 'Albedo' },
]

export { WALLETS }

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(() => localStorage.getItem('lob_addr'))
  const [walletName, setWalletName] = useState<string | null>(() => localStorage.getItem('lob_wname'))
  const [connecting, setConnecting] = useState(false)
  const [showPicker, setShowPicker] = useState(false)

  useEffect(() => {
    // TODO: handle case where wallet extension isn't installed
    try {
      StellarWalletsKit.init({
        modules: [
          new FreighterModule(),
          new xBullModule(),
          new AlbedoModule(),
        ],
      })
    } catch { /* already init */ }

    const savedId = localStorage.getItem('lob_wid')
    if (savedId) {
      try { StellarWalletsKit.setWallet(savedId) } catch { /* stale session */ }
    }
  }, [])

  const connect = useCallback(async (walletId?: string) => {
    const id = walletId || FREIGHTER_ID
    setConnecting(true)
    try {
      StellarWalletsKit.setWallet(id)
      console.log('connecting to', id)
      const { address: addr } = await StellarWalletsKit.getAddress()
      const wName = WALLETS.find(w => w.id === id)?.name || id
      setAddress(addr)
      setWalletName(wName)
      setShowPicker(false)
      localStorage.setItem('lob_wid', id)
      localStorage.setItem('lob_addr', addr)
      localStorage.setItem('lob_wname', wName)
    } catch (err: any) {
      console.error('wallet connect failed:', err)
      // TODO: show toast notification to user
    } finally {
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(() => {
    setAddress(null)
    setWalletName(null)
    setShowPicker(false)
    localStorage.removeItem('lob_wid')
    localStorage.removeItem('lob_addr')
    localStorage.removeItem('lob_wname')
  }, [])

  return (
    <Ctx.Provider value={{ address, walletName, connecting, connect, disconnect, showPicker, setShowPicker }}>
      {children}
    </Ctx.Provider>
  )
}

export function useWallet() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>')
  return ctx
}
