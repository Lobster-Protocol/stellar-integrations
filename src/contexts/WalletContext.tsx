import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { StellarWalletsKit, Networks, type ModuleInterface } from '@creit-tech/stellar-wallets-kit'
import { FreighterModule } from '@creit-tech/stellar-wallets-kit/modules/freighter'
import { xBullModule } from '@creit-tech/stellar-wallets-kit/modules/xbull'
import { AlbedoModule } from '@creit-tech/stellar-wallets-kit/modules/albedo'
import { LobstrModule } from '@creit-tech/stellar-wallets-kit/modules/lobstr'
import { WalletConnectModule, WalletConnectTargetChain } from '@creit-tech/stellar-wallets-kit/modules/wallet-connect'
import { useNetwork } from './NetworkContext'

interface WalletCtx {
  address: string | null
  walletName: string | null
  connecting: boolean
  connect: () => Promise<void>
  disconnect: () => void
}

const Ctx = createContext<WalletCtx | null>(null)

// module-level: kit is a static singleton, hot-reload would double-init
let kitInitialised = false

export function WalletProvider({ children }: { children: ReactNode }) {
  const { network } = useNetwork()
  // We rehydrate the address from localStorage to avoid the "Connect"
  // flash between page loads. The kit session isn't actually re-attached
  // silently though - the next signTransaction will throw and the user
  // will need to click Connect. TODO: silent reattach via setWallet +
  // getAddress on mount.
  const [address, setAddress] = useState<string | null>(() => localStorage.getItem('lob_addr'))
  const [walletName, setWalletName] = useState<string | null>(() => localStorage.getItem('lob_wname'))
  const [connecting, setConnecting] = useState(false)

  useEffect(() => {
    if (kitInitialised) return

    const wcProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined
    const stellarNetwork = network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET

    const modules: ModuleInterface[] = [
      new FreighterModule(),
      new xBullModule(),
      new AlbedoModule(),
      new LobstrModule(),
    ]

    if (wcProjectId) {
      modules.push(
        new WalletConnectModule({
          projectId: wcProjectId,
          metadata: {
            name: 'Lobster Protocol',
            description: 'Lobster Protocol dashboard',
            url: window.location.origin,
            icons: [`${window.location.origin}/lobster-icon.png`],
          },
          allowedChains: [
            network === 'mainnet'
              ? WalletConnectTargetChain.PUBLIC
              : WalletConnectTargetChain.TESTNET,
          ],
        }),
      )
    }

    try {
      StellarWalletsKit.init({
        modules,
        network: stellarNetwork,
      })
      kitInitialised = true
    } catch (err) {
      // kit throws if init is called twice - swallow that exact case,
      // anything else logs
      const msg = err instanceof Error ? err.message.toLowerCase() : ''
      if (!msg.includes('init') && !msg.includes('already')) {
        console.error('Stellar Wallets Kit init failed:', err)
      }
      kitInitialised = true
    }
    // intentionally not depending on `network` - re-init is unsafe on the
    // static kit, we use setNetwork below instead
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // sync the kit's selected network with our context every toggle, else
  // signTransaction silently uses the kit's initial passphrase
  useEffect(() => {
    if (!kitInitialised) return
    try {
      StellarWalletsKit.setNetwork(network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET)
    } catch (err) {
      console.error('StellarWalletsKit.setNetwork failed:', err)
    }
  }, [network])

  const connect = useCallback(async () => {
    setConnecting(true)
    try {
      const { address: addr } = await StellarWalletsKit.authModal()
      const picked = StellarWalletsKit.selectedModule?.productName || 'Stellar Wallet'
      setAddress(addr)
      setWalletName(picked)
      localStorage.setItem('lob_addr', addr)
      localStorage.setItem('lob_wname', picked)
    } catch (err: unknown) {
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
    // kit may throw if nothing was connected; tearing down anyway, ignore
    StellarWalletsKit.disconnect().catch(() => {})
  }, [])

  return (
    <Ctx.Provider value={{ address, walletName, connecting, connect, disconnect }}>
      {children}
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWallet() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>')
  return ctx
}
