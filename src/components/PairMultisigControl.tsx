import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Link2, X } from 'lucide-react'

import type { Network } from '../config/contracts'
import { useActiveProfile } from '../integrations/dfns/use-profiles'
import { useDfnsWallets } from '../integrations/dfns/hooks'
import { isAccountId } from '../integrations/stellar/strkey-guards'
import {
  OUR_STATIC_ADDRESSES,
  ourRuntimeAddresses,
  rememberOurAddresses,
  pairedFor,
  setPair,
  clearPair,
  subscribe,
  storeVersion,
} from '../integrations/dfns/wallet-pair'
import { shortenAddress, stellarExplorer } from '../utils/format'
import CopyButton from './CopyButton'

// A label the client controls: "this connected wallet shares control with that DFNS
// multisig account." It signs nothing and routes nothing; its only job is to refuse
// our own address as the pair (see wallet-pair.ts). Mounted in the TopBar next to the
// connected wallet, re-keyed per network+wallet so a switch clears the draft.
export default function PairMultisigControl({ address, network }: { address: string; network: Network }) {
  useSyncExternalStore(subscribe, storeVersion, storeVersion)
  const paired = pairedFor(network, address)

  const active = useActiveProfile()
  const wallets = useDfnsWallets()

  // the wallet list is only OUR treasury when the demo is the active custody; with a
  // client profile active it is the client's own list, which we must not blocklist,
  // and we do not fail closed (we are not the org being read).
  const demoActive = active?.kind === 'demo'
  const ready = !demoActive || wallets.isSuccess

  // the demo treasury address is not in the bundle, so learn it while the demo relay is
  // the active custody (the default on first load) and keep it for later.
  useEffect(() => {
    if (demoActive && wallets.isSuccess) {
      rememberOurAddresses((wallets.data?.items ?? []).map((w) => w.address))
    }
  }, [demoActive, wallets.isSuccess, wallets.data])

  const ourAddresses = useMemo(() => {
    const s = new Set([...OUR_STATIC_ADDRESSES, ...ourRuntimeAddresses()])
    if (demoActive) {
      for (const w of wallets.data?.items ?? []) if (isAccountId(w.address)) s.add(w.address)
    }
    return [...s]
  }, [demoActive, wallets.data])

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function save() {
    try {
      setPair(network, address, draft, { ourAddresses, ready })
      setDraft('')
      setError(null)
      setOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that address.')
    }
  }

  function toggle() {
    setError(null)
    setDraft(paired ?? '')
    setOpen((o) => !o)
  }

  return (
    <div ref={rootRef} className="relative flex items-center gap-1">
      {paired && (
        <span
          className="hidden sm:flex items-center gap-0.5 text-[10px] text-text-muted"
          title="Multisig you declared for this wallet, not verified on-chain"
        >
          <Link2 size={11} className="text-primary" />
          <a
            href={stellarExplorer(network, 'account', paired)}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono hover:text-primary hover:underline"
          >
            {shortenAddress(paired, 4)}
          </a>
          <CopyButton value={paired} what="paired multisig address" />
          <button
            onClick={() => clearPair(network, address)}
            aria-label="Remove paired multisig"
            className="hover:text-error"
          >
            <X size={11} />
          </button>
        </span>
      )}

      <button
        onClick={toggle}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={paired ? 'Edit paired DFNS multisig' : 'Pair a DFNS multisig wallet'}
        title={paired ? 'Edit paired DFNS multisig' : 'Pair a DFNS multisig wallet'}
        className="text-text-muted hover:text-primary p-1 rounded-full hover:bg-primary/5 transition-colors"
      >
        <Link2 size={14} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Pair a DFNS multisig wallet"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
          }}
          className="absolute right-0 top-full mt-1 z-50 w-72 rounded-lg border border-text-muted/15 bg-bg-card shadow-lg p-3 text-left"
        >
          <p className="text-xs font-semibold text-text">Pair a DFNS multisig wallet</p>
          <p className="mt-1 text-[11px] text-text-muted leading-snug">
            Note that this wallet shares control with a DFNS multisig account. It is a label shown here,
            nothing is signed or sent.
          </p>
          <input
            autoFocus
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value)
              setError(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save()
            }}
            placeholder="G... multisig account"
            spellCheck={false}
            autoComplete="off"
            className="mt-2 w-full rounded border border-text-muted/20 bg-bg px-2 py-1 text-xs font-mono text-text focus:border-primary focus:outline-none"
          />
          {!ready && <p className="mt-1 text-[10px] text-text-muted">Confirming addresses, one moment...</p>}
          {error && <p className="mt-1 text-[10px] text-error">{error}</p>}
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              onClick={() => {
                setOpen(false)
                setError(null)
              }}
              className="text-[11px] text-text-muted hover:text-text px-2 py-1"
            >
              Cancel
            </button>
            <button
              onClick={save}
              className="text-[11px] font-semibold text-white bg-primary hover:bg-primary-dark rounded px-2.5 py-1"
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
