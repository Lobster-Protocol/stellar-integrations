import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import { StellarWalletsKit, Networks, type ModuleInterface } from '@creit-tech/stellar-wallets-kit'
import { FreighterModule } from '@creit-tech/stellar-wallets-kit/modules/freighter'
import { xBullModule } from '@creit-tech/stellar-wallets-kit/modules/xbull'
import { AlbedoModule, ALBEDO_ID } from '@creit-tech/stellar-wallets-kit/modules/albedo'
import { LobstrModule } from '@creit-tech/stellar-wallets-kit/modules/lobstr'
import { WalletConnectModule, WalletConnectTargetChain, WALLET_CONNECT_ID } from '@creit-tech/stellar-wallets-kit/modules/wallet-connect'
import { useNetwork } from './NetworkContext'
import { useToast } from './ToastContext'

interface WalletCtx {
  address: string | null
  walletName: string | null
  // the connected wallet's module id (e.g. WALLET_CONNECT_ID), so the UI can tell a
  // DFNS-over-WalletConnect wallet apart from a browser extension wallet.
  walletId: string | null
  connecting: boolean
  connect: () => Promise<void>
  // open WalletConnect straight away, for a DFNS MPC wallet the client pairs from
  // their own DFNS console.
  connectWalletConnect: () => Promise<string | null>
  walletConnectEnabled: boolean
  disconnect: () => void
}

const Ctx = createContext<WalletCtx | null>(null)

// module-level: kit is a static singleton, hot-reload would double-init
let kitInitialised = false

export function WalletProvider({ children }: { children: ReactNode }) {
  const { network } = useNetwork()
  // Rehydrated from localStorage to avoid the "Connect" flash between page
  // loads. The effect below is what actually re-attaches the kit session.
  const [address, setAddress] = useState<string | null>(() => localStorage.getItem('lob_addr'))
  const [walletName, setWalletName] = useState<string | null>(() => localStorage.getItem('lob_wname'))
  const [walletId, setWalletId] = useState<string | null>(() => localStorage.getItem('lob_wid'))
  const [connecting, setConnecting] = useState(false)
  const toast = useToast()

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
          // both chains, so one session survives a testnet/mainnet toggle: the kit
          // freezes allowedChains at init and never re-scopes the session on
          // setNetwork, so a single-chain session would reject the other network.
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

  // the rehydrated address looks connected, but the wallet refuses to sign until the site
  // has access this session. setWallet + fetchAddress asks for it, silent once approved.
  useEffect(() => {
    if (!kitInitialised) return
    const wid = localStorage.getItem('lob_wid')
    // Albedo prompts on every getAddress, so it is left to ask at sign time. WalletConnect
    // restores its own session, and getAddress would start a fresh pairing and pop the QR.
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
        // wallet locked, access denied, or extension missing: keep the
        // rehydrated address, the user can reconnect from the header.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // kept internal so a button's onClick event can never arrive here as a bogus wallet id
  const runConnect = useCallback(
    async (openId?: string): Promise<string | null> => {
      setConnecting(true)
      try {
        if (openId) StellarWalletsKit.setWallet(openId)
        // fetchAddress delegates to the module and opens its modal (the WalletConnect
        // QR); the static getAddress only returns whatever is already in memory.
        const { address: addr } = openId
          ? await StellarWalletsKit.fetchAddress()
          : await StellarWalletsKit.authModal()
        const mod = StellarWalletsKit.selectedModule
        const picked = mod?.productName || 'Stellar Wallet'
        setAddress(addr)
        setWalletName(picked)
        localStorage.setItem('lob_addr', addr)
        localStorage.setItem('lob_wname', picked)
        // remember which module so we can re-attach the session on the next load
        if (mod?.productId) {
          localStorage.setItem('lob_wid', mod.productId)
          setWalletId(mod.productId)
        }
        toast.success(
          mod?.productId === WALLET_CONNECT_ID
            ? 'DFNS wallet connected over WalletConnect'
            : `${picked} connected`,
        )
        return addr
      } catch (err: unknown) {
        console.error('wallet connect failed:', err)
        // the kit rejects on both a real failure and the user just closing the
        // wallet/QR modal - keep a dismissal quiet, shout only on a real error.
        const m = err instanceof Error ? err.message.toLowerCase() : ''
        if (/reject|declin|cancel|close|dismiss|expired|abort|user/.test(m)) {
          toast.info('Connection cancelled.')
        } else {
          toast.error('Could not connect. Check your wallet and try again.')
        }
        return null
      } finally {
        setConnecting(false)
      }
    },
    [toast],
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
    // kit may throw if nothing was connected; tearing down anyway, ignore
    StellarWalletsKit.disconnect().catch(() => {})
    toast.info('Wallet disconnected')
  }, [toast])

  // the WC module is only registered when the project id is set (see the init
  // effect above), so the UI hides the WalletConnect path when it is not.
  const walletConnectEnabled = !!(import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined)

  return (
    <Ctx.Provider
      value={{ address, walletName, walletId, connecting, connect, connectWalletConnect, walletConnectEnabled, disconnect }}
    >
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
