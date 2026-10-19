import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { StellarWalletsKit, Networks, type ModuleInterface } from '@creit-tech/stellar-wallets-kit'
import { FreighterModule } from '@creit-tech/stellar-wallets-kit/modules/freighter'
import { xBullModule } from '@creit-tech/stellar-wallets-kit/modules/xbull'
import { AlbedoModule, ALBEDO_ID } from '@creit-tech/stellar-wallets-kit/modules/albedo'
import { LobstrModule } from '@creit-tech/stellar-wallets-kit/modules/lobstr'
import { WalletConnectModule, WalletConnectTargetChain, WALLET_CONNECT_ID } from '@creit-tech/stellar-wallets-kit/modules/wallet-connect'
import { useNetwork } from './NetworkContext'
import { useToast } from './ToastContext'
import { setViewingAddress } from '../integrations/signer/wallet-kit-signer'
import { isAccountId } from '../integrations/stellar/strkey-guards'

interface WalletCtx {
  // the account every page reads: the connected wallet, or the one being viewed
  address: string | null
  // someone else's account opened read-only (?view=G...). the wallet kit refuses to sign while it's set
  viewing: string | null
  view: (account: string) => void
  stopViewing: () => void
  walletName: string | null
  // module id, which tells a WalletConnect session from an extension
  walletId: string | null
  connecting: boolean
  connect: () => Promise<void>
  // straight to WalletConnect, for a DFNS wallet paired from the client's own console
  connectWalletConnect: () => Promise<string | null>
  walletConnectEnabled: boolean
  disconnect: () => void
}

const Ctx = createContext<WalletCtx | null>(null)

// module-level, so a remount or StrictMode's second run doesn't init the static kit again
let kitInitialised = false

// a link can open an account read-only; the tab keeps it across reloads until left
function linkedView(): string | null {
  const linked = new URLSearchParams(window.location.search).get('view')
  if (isAccountId(linked)) {
    sessionStorage.setItem('lob_view', linked!)
    return linked
  }
  const kept = sessionStorage.getItem('lob_view')
  return isAccountId(kept) ? kept : null
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { network } = useNetwork()
  // rehydrated to skip the "Connect" flash; the fetchAddress effect re-attaches the session
  const [address, setAddress] = useState<string | null>(() => localStorage.getItem('lob_addr'))
  const [walletName, setWalletName] = useState<string | null>(() => localStorage.getItem('lob_wname'))
  const [walletId, setWalletId] = useState<string | null>(() => localStorage.getItem('lob_wid'))
  const [viewing, setViewing] = useState<string | null>(linkedView)
  const [connecting, setConnecting] = useState(false)
  const toast = useToast()

  useEffect(() => {
    setViewingAddress(viewing)
  }, [viewing])

  const view = useCallback((account: string) => {
    if (!isAccountId(account)) return
    sessionStorage.setItem('lob_view', account)
    setViewing(account)
  }, [])

  const stopViewing = useCallback(() => {
    sessionStorage.removeItem('lob_view')
    setViewing(null)
    // drop the param too, or a reload of the same url would open the view again
    const url = new URL(window.location.href)
    if (url.searchParams.has('view')) {
      url.searchParams.delete('view')
      window.history.replaceState(window.history.state, '', url)
    }
  }, [])

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
          // both chains, since setNetwork never re-scopes the chains fixed at init
          allowedChains: [WalletConnectTargetChain.PUBLIC, WalletConnectTargetChain.TESTNET],
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
      const msg = err instanceof Error ? err.message.toLowerCase() : ''
      if (!msg.includes('init') && !msg.includes('already')) {
        console.error('Stellar Wallets Kit init failed:', err)
      }
      kitInitialised = true
    }
    // the static kit is set up once; the setNetwork effect below follows network changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // without this, signTransaction silently keeps the kit's initial passphrase
  useEffect(() => {
    if (!kitInitialised) return
    try {
      StellarWalletsKit.setNetwork(network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET)
    } catch (err) {
      console.error('StellarWalletsKit.setNetwork failed:', err)
    }
  }, [network])

  // a rehydrated address can't sign until the site has access again this session.
  // fetchAddress asks for it, silently once approved
  useEffect(() => {
    if (!kitInitialised) return
    const wid = localStorage.getItem('lob_wid')
    // Albedo prompts on every fetchAddress; it asks at sign time instead. WalletConnect
    // restores its own session, and fetchAddress would pop a new QR.
    if (!wid || wid === ALBEDO_ID || wid === WALLET_CONNECT_ID || !localStorage.getItem('lob_addr'))
      return
    let cancelled = false
    void (async () => {
      try {
        StellarWalletsKit.setWallet(wid)
        const { address: fresh } = await StellarWalletsKit.fetchAddress()
        if (!cancelled && fresh) {
          setAddress(fresh)
          localStorage.setItem('lob_addr', fresh)
        }
      } catch {
        // keep the rehydrated address, the user can reconnect from the header
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // connect wraps this, or onClick={connect} would pass its click event in as openId
  const runConnect = useCallback(
    async (openId?: string): Promise<string | null> => {
      setConnecting(true)
      try {
        if (openId) StellarWalletsKit.setWallet(openId)
        // fetchAddress opens the module's modal (the WC QR), getAddress only reads memory
        const { address: addr } = openId
          ? await StellarWalletsKit.fetchAddress()
          : await StellarWalletsKit.authModal()
        const mod = StellarWalletsKit.selectedModule
        const picked = mod?.productName || 'Stellar Wallet'
        stopViewing()
        setAddress(addr)
        setWalletName(picked)
        localStorage.setItem('lob_addr', addr)
        localStorage.setItem('lob_wname', picked)
        // read back on the next load to re-attach the session
        if (mod?.productId) {
          localStorage.setItem('lob_wid', mod.productId)
          setWalletId(mod.productId)
        }
        toast.success(
          mod?.productId === WALLET_CONNECT_ID
            ? 'Wallet connected over WalletConnect.'
            : `${picked} connected.`,
        )
        return addr
      } catch (err: unknown) {
        // a closed modal comes back as a plain { code, message }, not an Error
        const raw = typeof err === 'string' ? err : (err as { message?: unknown } | null)?.message
        const m = String(raw ?? '').toLowerCase()
        if (/reject|declin|cancel|close|dismiss|expired|abort|user/.test(m)) {
          toast.info('Connection cancelled.')
        } else {
          console.error('wallet connect failed:', err)
          toast.error('Could not connect. Check your wallet and try again.')
        }
        return null
      } finally {
        setConnecting(false)
      }
    },
    [toast, stopViewing],
  )

  const connect = useCallback(async () => {
    await runConnect()
  }, [runConnect])
  const connectWalletConnect = useCallback(() => runConnect(WALLET_CONNECT_ID), [runConnect])

  const disconnect = useCallback(() => {
    setAddress(null)
    setWalletName(null)
    setWalletId(null)
    localStorage.removeItem('lob_addr')
    localStorage.removeItem('lob_wname')
    localStorage.removeItem('lob_wid')
    // rejects when nothing was connected, harmless on teardown
    StellarWalletsKit.disconnect().catch(() => {})
    toast.info('Wallet disconnected.')
  }, [toast])

  // no project id, no WC module
  const walletConnectEnabled = !!(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined)

  return (
    <Ctx.Provider
      value={{
        address: viewing ?? address,
        viewing,
        view,
        stopViewing,
        walletName,
        walletId,
        connecting,
        connect,
        connectWalletConnect,
        walletConnectEnabled,
        disconnect,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- hook lives beside its provider
export function useWallet() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useWallet must be used inside <WalletProvider>')
  return ctx
}
