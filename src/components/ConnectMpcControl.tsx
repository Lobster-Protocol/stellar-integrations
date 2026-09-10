import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Check } from 'lucide-react'

import { WALLET_CONNECT_ID } from '@creit-tech/stellar-wallets-kit/modules/wallet-connect'

import { useCustody } from '../contexts/CustodyContext'
import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useActiveProfile, useProfiles } from '../integrations/dfns/use-profiles'
import { useDfnsWallets } from '../integrations/dfns/hooks'
import { setSelectedWallet, removeClientProfile, clearActiveProfile, setActiveProfile, type DfnsNetwork } from '../integrations/dfns/profiles'
import { shortenAddress, stellarExplorer, cn } from '../utils/format'
import CopyButton from './CopyButton'
import ConnectRelayForm from './ConnectRelayForm'

// The top-right "+ MPC" control for connecting a DFNS MPC wallet. The default is
// WalletConnect - the DFNS wallet pairs from the client's own DFNS console, and
// signs there. Running your own relay is the other way in, shown plainly, not hidden. It never routes to
// Lobster's own org: the demo profile is opt-in from the Audit page and shown, if
// active, plainly as a testnet demo. Approvals happen in the client's DFNS console.
export default function ConnectMpcControl() {
  const { mode, dfnsAddress, setMode } = useCustody()
  const { connectWalletConnect, walletConnectEnabled, walletId, connecting } = useWallet()
  const { network } = useNetwork()
  const active = useActiveProfile()
  const profiles = useProfiles()
  const target: DfnsNetwork = network === 'mainnet' ? 'Stellar' : 'StellarTestnet'
  const [open, setOpen] = useState(false)
  const [adding, setAdding] = useState(false)
  const [relayOpen, setRelayOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // the popover renders through a portal on document.body, so the top bar's
  // backdrop-blur (which traps a z-index) can never let page content paint over
  // it. anchor it under the trigger with fixed coords, recomputed while open.
  useLayoutEffect(() => {
    if (!open) return
    function place() {
      const r = triggerRef.current?.getBoundingClientRect()
      if (r) setPos({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // move focus into the panel when it opens: it is portaled to the end of the body,
  // so without this a keyboard user would have to tab through the whole page to reach it.
  useEffect(() => {
    if (open && pos) panelRef.current?.focus()
  }, [open, pos])

  const isClient = active?.kind === 'client'
  const isDemo = active?.kind === 'demo'
  const showClientChip = mode === 'dfns' && isClient && !!dfnsAddress
  const showDemoChip = mode === 'dfns' && isDemo && !!dfnsAddress
  const isWcConnected = walletId === WALLET_CONNECT_ID
  // saved relays plus the testnet-only demo, offered as one-click picks in the popover.
  const pickable = profiles.filter((p) => !(p.kind === 'demo' && network === 'mainnet'))

  function toggle() {
    setAdding(false)
    setOpen((v) => !v)
  }

  // a DFNS wallet connected over WalletConnect already shows in the wallet chip, so a
  // second "+ MPC" invite beside it only confuses. hide this control then - unless there
  // is a saved relay or the testnet demo to pick, or we are in relay (dfns) custody.
  if (isWcConnected && !showClientChip && !showDemoChip && pickable.length === 0) return null

  return (
    <div ref={triggerRef} className="relative">
      {showClientChip ? (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 hover:bg-primary/10 transition-colors"
        >
          <span className="text-[10px] text-text-muted leading-none">Your DFNS</span>
          <span className="text-xs text-text font-mono">{shortenAddress(dfnsAddress, 4)}</span>
          <span className="rounded-full bg-ok/10 text-ok text-[9px] font-semibold px-1.5 py-0.5">Signs</span>
          <NetTag network={network} />
        </button>
      ) : showDemoChip ? (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/5 px-2.5 py-1 hover:bg-amber-500/10 transition-colors"
        >
          <span className="text-[10px] text-amber-600 leading-none">DFNS demo</span>
          <span className="text-xs text-text font-mono">{shortenAddress(dfnsAddress, 4)}</span>
          <span className="rounded-full bg-amber-500/10 text-amber-600 text-[9px] font-semibold px-1.5 py-0.5">
            testnet
          </span>
        </button>
      ) : (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label="Connect your DFNS MPC wallet"
          className="flex items-center gap-1 rounded-full border border-text-muted/25 px-2.5 py-1 text-xs font-medium text-text-secondary hover:bg-bg hover:text-text transition-colors"
        >
          <Plus size={13} />
          MPC
        </button>
      )}

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Connect your DFNS MPC wallet"
            tabIndex={-1}
            style={{
              position: 'fixed',
              top: pos.top,
              right: pos.right,
              zIndex: 1000,
              maxHeight: `calc(100vh - ${pos.top + 16}px)`,
            }}
            className="w-80 max-w-[calc(100vw-1rem)] overflow-y-auto rounded-2xl border border-text-muted/15 bg-bg-card shadow-xl p-3 text-left outline-none"
          >
          {active?.kind === 'client' && !adding ? (
            <ClientPanel
              network={network}
              target={target}
              profileId={active.id}
              currentAddress={dfnsAddress}
              onPicked={() => {
                setMode('dfns')
                setOpen(false)
              }}
              onAddAnother={() => setAdding(true)}
              onDisconnect={() => {
                removeClientProfile(active.id)
                setMode('wallet-kit')
                setOpen(false)
              }}
            />
          ) : active?.kind === 'demo' && !adding ? (
            <div className="space-y-2">
              <p className="text-xs text-text-secondary">
                You are viewing Lobster's testnet demo custody, not your own DFNS. Connect the relay
                you run for your own DFNS to use your own MPC.
              </p>
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="w-full rounded-full bg-primary text-white text-xs font-semibold py-1.5"
              >
                Connect your own DFNS
              </button>
              <button
                type="button"
                onClick={() => {
                  clearActiveProfile()
                  setMode('wallet-kit')
                  setOpen(false)
                }}
                className="w-full text-[11px] text-text-muted hover:text-coral py-1"
              >
                Disconnect the demo
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {adding && (isClient || isDemo) && (
                <button
                  type="button"
                  onClick={() => setAdding(false)}
                  className="text-[11px] text-text-muted hover:text-text"
                >
                  &larr; Back
                </button>
              )}
              {!adding && pickable.length > 0 && (
                <div className="space-y-1">
                  <p className="text-[11px] text-text-muted">Your saved DFNS connections</p>
                  <ul className="space-y-1">
                    {pickable.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveProfile(p.id)
                            setMode('dfns')
                            setOpen(false)
                          }}
                          className="w-full flex items-center justify-between gap-2 rounded-xl border border-text-muted/15 px-2.5 py-1.5 text-left hover:bg-bg"
                        >
                          <span className="truncate text-xs text-text">{p.label}</span>
                          {p.kind === 'demo' && (
                            <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-600">
                              testnet demo
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="text-[10px] text-text-muted">or connect a new one below.</p>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-text">Connect your DFNS MPC wallet</p>
                <p className="text-[11px] text-text-muted">
                  Connect over WalletConnect and approve the pairing in your own DFNS console. Your
                  keys never leave DFNS. It then shows as your connected wallet, top right.
                </p>
              </div>

              {walletConnectEnabled ? (
                <button
                  type="button"
                  disabled={connecting}
                  onClick={async () => {
                    // flip to the wallet-kit signer only once the wallet actually
                    // connects, so a dismissed modal does not drop the current mode.
                    const addr = await connectWalletConnect()
                    if (addr) {
                      setMode('wallet-kit')
                      setOpen(false)
                    }
                  }}
                  className="w-full rounded-full bg-primary text-white text-xs font-semibold py-2 hover:bg-primary-dark transition-colors disabled:opacity-50"
                >
                  {connecting ? 'Connecting...' : 'Connect with WalletConnect'}
                </button>
              ) : (
                <p className="rounded-xl bg-amber-500/10 text-amber-600 px-3 py-2 text-[11px]">
                  WalletConnect is not enabled on this dashboard yet. Ask your admin to set the
                  WalletConnect project id, or run your own relay below.
                </p>
              )}

              <button
                type="button"
                onClick={() => setRelayOpen((v) => !v)}
                aria-expanded={relayOpen}
                className="w-full text-left rounded-xl border border-text-muted/15 px-3 py-2 hover:bg-bg transition-colors"
              >
                <span className="block text-xs font-medium text-text">Run your own relay</span>
                <span className="block text-[11px] text-text-muted">
                  Point the dashboard at a DFNS relay you host, under your own spend rules (address + read token).
                </span>
              </button>
              {(relayOpen || !walletConnectEnabled) && (
                <div className="mt-1">
                  <ConnectRelayForm
                    onSaved={() => {
                      setRelayOpen(false)
                      setAdding(false)
                    }}
                    onCancel={() => (isClient || isDemo ? setAdding(false) : setRelayOpen(false))}
                  />
                </div>
              )}
            </div>
          )}
          </div>,
          document.body,
        )}
    </div>
  )
}

function NetTag({ network }: { network: 'testnet' | 'mainnet' }) {
  return (
    <span
      className={cn(
        'rounded-full text-[9px] font-semibold px-1.5 py-0.5',
        network === 'mainnet' ? 'bg-green/10 text-green' : 'bg-amber-500/10 text-amber-600',
      )}
    >
      {network}
    </span>
  )
}

function ClientPanel({
  network,
  target,
  profileId,
  currentAddress,
  onPicked,
  onAddAnother,
  onDisconnect,
}: {
  network: 'testnet' | 'mainnet'
  target: DfnsNetwork
  profileId: string
  currentAddress: string | null
  onPicked: () => void
  onAddAnother: () => void
  onDisconnect: () => void
}) {
  const wallets = useDfnsWallets()
  const items = (wallets.data?.items ?? []).filter((w) => w.network === target)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-text">Your DFNS wallets</p>
        <NetTag network={network} />
      </div>

      {wallets.isLoading ? (
        <p className="text-[11px] text-text-muted">Reading your wallets...</p>
      ) : wallets.isError ? (
        <p className="text-[11px] text-coral break-words">
          Could not read your relay. Check it is running and reachable.
        </p>
      ) : items.length === 0 ? (
        <p className="text-[11px] text-text-muted">
          No wallet on {network} in this DFNS org. Create one in your DFNS console, then reopen this.
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((w) => {
            const isCurrent = currentAddress === w.address
            return (
              <li key={w.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedWallet(profileId, { walletId: w.id, address: w.address, network: target })
                    onPicked()
                  }}
                  className={cn(
                    'w-full flex items-center gap-2 rounded-xl px-2.5 py-1.5 border text-left transition-colors',
                    isCurrent ? 'border-primary bg-primary/5' : 'border-text-muted/15 hover:bg-bg',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-text truncate">{w.name || 'wallet'}</span>
                    <span className="block text-[10px] text-text-muted font-mono">{shortenAddress(w.address, 5)}</span>
                  </span>
                  {isCurrent && <Check size={14} className="text-primary shrink-0" />}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {currentAddress && (
        <div className="flex items-center gap-1.5 rounded-xl bg-bg px-2.5 py-1.5">
          <span className="text-[10px] text-text-muted">In use</span>
          <a
            href={stellarExplorer(network, 'account', currentAddress)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-text font-mono hover:text-primary hover:underline"
          >
            {shortenAddress(currentAddress, 5)}
          </a>
          <CopyButton value={currentAddress} what="your DFNS wallet address" />
        </div>
      )}

      <p className="text-[10px] text-text-muted">
        Approvals for these wallets happen in your own DFNS console, not here.
      </p>

      <div className="flex items-center justify-between pt-1">
        <button type="button" onClick={onAddAnother} className="text-[11px] text-primary hover:underline">
          Connect another DFNS
        </button>
        <button type="button" onClick={onDisconnect} className="text-[11px] text-text-muted hover:text-coral">
          Disconnect
        </button>
      </div>
    </div>
  )
}
