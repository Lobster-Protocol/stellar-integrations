import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { StellarWalletsKit } from '@creit-tech/stellar-wallets-kit'
import { FreighterModule } from '@creit-tech/stellar-wallets-kit/modules/freighter'
import { xBullModule } from '@creit-tech/stellar-wallets-kit/modules/xbull'
import { AlbedoModule } from '@creit-tech/stellar-wallets-kit/modules/albedo'

interface WalletCtx {
  address: string | null
  walletName: string | null
  connecting: boolean
  connect: () => Promise<void>
  disconnect: () => void
}

const Ctx = createContext<WalletCtx | null>(null)

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(() => localStorage.getItem('lob_addr'))
  const [walletName, setWalletName] = useState<string | null>(() => localStorage.getItem('lob_wname'))
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    try {
      StellarWalletsKit.init({
        modules: [
          new FreighterModule(),
          new xBullModule(),
          new AlbedoModule(),
        ],
      })
    } catch { /* already init */ }
  }, [])

  // use the built-in auth modal — it handles wallet selection + connection
  const connect = useCallback(async () => {
    setConnecting(true)
    try {
      const { address: addr } = await StellarWalletsKit.authModal()
      console.log('connected:', addr)
      setAddress(addr)
      setWalletName('Stellar Wallet')
      localStorage.setItem('lob_addr', addr)
      localStorage.setItem('lob_wname', 'Stellar Wallet')
    } catch (err: any) {
      console.error('wallet connect failed:', err)
    } finally {
      setConnecting(false)
    }
  }, [])

  const disconnect = useCallback(() => {
    setAddress(null)
    setWalletName(null)
    localStorage.removeItem('lob_addr')
    localStorage.removeItem('lob_wname')
    StellarWalletsKit.disconnect().catch(() => {})
  }, [])

  return (
    <Ctx.Provider value={{ address, walletName, connecting, connect, disconnect }}>
      {children}
    </Ctx.Provider>
  )
}

export function useWallet() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>')
  return ctx
}
