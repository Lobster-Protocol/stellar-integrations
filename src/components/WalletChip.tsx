import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, LogOut } from 'lucide-react'
import { WALLET_CONNECT_ID } from '@creit-tech/stellar-wallets-kit/modules/wallet-connect'

import { useWallet } from '../contexts/WalletContext'
import { useCustody } from '../contexts/CustodyContext'
import type { Network } from '../config/contracts'
import { shortenAddress, stellarExplorer, cn } from '../utils/format'
import CopyButton from './CopyButton'

// The single "what's connected" chip. One pill - a status dot, the wallet's name, its
// short address - that opens a menu with the address actions and disconnect, instead
// of a row of loose icons. A "Signs" tag marks it when it is the active signer, so it
// never competes silently with the DFNS-relay chip.
export default function WalletChip({ address, network }: { address: string; network: Network }) {
  const { walletName, walletId, disconnect } = useWallet()
  const { mode } = useCustody()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const triggerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const isWc = walletId === WALLET_CONNECT_ID
  const label = isWc ? 'DFNS · WalletConnect' : walletName || 'Wallet'
  const signs = mode === 'wallet-kit'

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

  return (
    <div ref={triggerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Connected wallet"
        className="flex items-center gap-1.5 rounded-full border border-text-muted/20 bg-bg px-2.5 py-1 hover:bg-bg-card transition-colors"
      >
        <span
          className={cn('h-1.5 w-1.5 rounded-full shrink-0', signs ? 'bg-ok' : 'bg-text-muted')}
          title={signs ? 'Connected, signs your transactions' : 'Connected'}
        />
        <span className="hidden sm:block text-[10px] text-text-muted leading-none">{label}</span>
        <span className="text-xs text-text font-mono">{shortenAddress(address, 4)}</span>
        {signs && (
          <span className="hidden sm:inline rounded-full bg-ok/10 text-ok text-[9px] font-semibold px-1.5 py-0.5">
            Signs
          </span>
        )}
        <ChevronDown size={12} className="text-text-muted" />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 1000 }}
            className="w-64 max-w-[calc(100vw-1rem)] rounded-2xl border border-text-muted/15 bg-bg-card shadow-xl p-2 text-left"
          >
            <div className="px-2 py-1.5">
              <p className="text-[10px] text-text-muted">{label}</p>
              <span className="flex items-center gap-1">
                <a
                  href={stellarExplorer(network, 'account', address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-text font-mono hover:text-primary hover:underline"
                >
                  {shortenAddress(address, 6)}
                </a>
                <CopyButton value={address} what="your wallet address" />
              </span>
              {isWc && (
                <p className="mt-1 text-[10px] text-text-muted leading-snug">
                  You approve every transaction in your own DFNS console.
                </p>
              )}
            </div>
            <div className="my-1 border-t border-text-muted/10" />
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                disconnect()
                setOpen(false)
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-text-secondary hover:bg-error/5 hover:text-error transition-colors"
            >
              <LogOut size={13} />
              Disconnect
            </button>
          </div>,
          document.body,
        )}
    </div>
  )
}
