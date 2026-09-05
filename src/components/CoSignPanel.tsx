import { useMemo, useState } from 'react'

import { walletKitSigner } from '../integrations/signer/wallet-kit-signer'
import { networkPassphrase } from '../integrations/lobster/client'
import {
  combine,
  signedBy,
  accumulatedWeight,
  requiredWeight,
  type AccountSigning,
} from '../integrations/stellar/multisig'
import { summarizeTx, type TxSummary } from '../integrations/stellar/tx-summary'
import type { Network } from '../integrations/lobster/types'
import { cn } from '../utils/format'
import CopyButton from './CopyButton'

interface Props {
  network: Network
  signing: AccountSigning
  // the frozen, assembled transaction everyone signs. built and simulated once,
  // never rebuilt after a signature is collected, or the hash changes and the
  // signatures already gathered stop matching.
  baseXdr: string
  // the wallet connected right now, so its holder can add their own signature
  connected: string
  submit: (fullySignedXdr: string) => Promise<string>
  onSubmitted: (hash: string) => void
}

function short(key: string): string {
  return `${key.slice(0, 4)}...${key.slice(-4)}`
}

export default function CoSignPanel({ network, signing, baseXdr, connected, submit, onSubmitted }: Props) {
  // the canonical envelope: starts as the base, grows one verified signature at a
  // time. combine() only ever adds signatures to it, so a wallet that drops the
  // ones already there cannot lose the quorum.
  const [working, setWorking] = useState(baseXdr)
  const [busy, setBusy] = useState<'idle' | 'signing' | 'submitting'>('idle')
  const [err, setErr] = useState<string | null>(null)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteVal, setPasteVal] = useState('')
  const [ack, setAck] = useState(false)

  // decode what is actually being signed from the frozen base, so a co-signer
  // sees the operations instead of an opaque blob. dangers are an op sourced off
  // this account (the multi-source hijack) or an account-control op; those gate
  // the sign and submit buttons behind an explicit acknowledgement.
  const summary = useMemo<TxSummary | null>(() => {
    try {
      return summarizeTx(baseXdr, network, signing.accountId)
    } catch {
      return null
    }
  }, [baseXdr, network, signing.accountId])
  const hasDangers = (summary?.dangers.length ?? 0) > 0
  const blocked = hasDangers && !ack

  // a set_options or account_merge is a high-threshold op, so the quorum needed
  // is high, not med. gate on the real tier or a governance change on a 2-of-3
  // (high 3 > med 2) would read "enough" at 2 signatures and the chain would
  // then reject it.
  const tier: 'med' | 'high' =
    summary?.operations.some((o) => o.type === 'setOptions' || o.type === 'accountMerge')
      ? 'high'
      : 'med'
  const need = requiredWeight(signing, tier)
  const { weight, signed, enough, tooMany, connectedIsSigner } = useMemo(() => {
    const s = signedBy(working, network, signing)
    const w = accumulatedWeight(working, network, signing)
    return {
      weight: w,
      signed: s,
      enough: w >= need,
      tooMany: w > need,
      connectedIsSigner: signing.signers.some((sg) => sg.key === connected),
    }
  }, [working, network, signing, need, connected])

  async function signMine() {
    if (busy !== 'idle') return
    setErr(null)
    setBusy('signing')
    try {
      // sign the frozen base, not the growing envelope: each signer signs the
      // same tx independently and we merge the result, so it never matters
      // whether a given wallet preserves the other signatures.
      const { signedTxXdr } = await walletKitSigner.signTransaction(baseXdr, {
        networkPassphrase: networkPassphrase(network),
        address: connected,
      })
      if (!signedTxXdr) throw new Error('the wallet did not return a signed transaction')
      const merged = combine(working, signedTxXdr, network, signing)
      if (merged === working) {
        setErr('That signature did not add anything. This wallet may not be one of the signers, or it already signed.')
      } else {
        setWorking(merged)
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message.split('\n')[0].slice(0, 180) : 'signing failed')
    } finally {
      setBusy('idle')
    }
  }

  function applyPaste() {
    setErr(null)
    try {
      const merged = combine(working, pasteVal.trim(), network, signing)
      if (merged === working) {
        setErr('That copy added no new signature. Check it is the same transaction, signed by another signer.')
      } else {
        setWorking(merged)
        setPasteVal('')
        setPasteOpen(false)
      }
    } catch {
      setErr('That does not read as a signed transaction for this network.')
    }
  }

  async function doSubmit() {
    if (busy !== 'idle' || !enough || tooMany) return
    setErr(null)
    setBusy('submitting')
    try {
      const hash = await submit(working)
      onSubmitted(hash)
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'submit failed'
      // a shared account has one sequence number. if another transaction used it
      // while this one was gathering signatures, the chain rejects this one and
      // it cannot be salvaged; the signatures are over the old sequence. say so
      // rather than leaving a raw tx_bad_seq on screen.
      setErr(
        /bad.?seq|tx_bad_seq|sequence/i.test(raw)
          ? 'Another transaction already used this account sequence number while this one was being signed. This one cannot go through. Build it again from a fresh transaction.'
          : raw.split('\n')[0].slice(0, 180),
      )
    } finally {
      setBusy('idle')
    }
  }

  return (
    <div className="space-y-3">
      {summary && (
        <div className={cn('rounded-2xl px-3 py-3 text-xs', hasDangers ? 'bg-coral/10' : 'bg-bg')}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-text-secondary">What you are approving</span>
            <span className="text-[10px] uppercase tracking-wide text-text-muted">on {network}</span>
          </div>
          <ul className="space-y-1">
            {summary.operations.map((op) => (
              <li
                key={op.index}
                className={cn('flex flex-col', op.danger !== 'none' ? 'text-coral' : 'text-text')}
              >
                <span>
                  {op.index + 1}. {op.detail}
                </span>
                {op.offAccount && (
                  <span className="text-[10px] text-coral">from {short(op.source)}, not this account</span>
                )}
              </li>
            ))}
          </ul>
          {hasDangers && (
            <div className="mt-2 space-y-1.5">
              {summary.dangers.map((d, i) => (
                <p key={i} className="text-[11px] text-coral font-medium">
                  {d}
                </p>
              ))}
              <label className="flex items-start gap-2 text-[11px] text-text-secondary">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                  className="mt-0.5"
                />
                <span>I have read what this transaction does and I approve it.</span>
              </label>
            </div>
          )}
        </div>
      )}

      <div className="rounded-2xl bg-bg px-3 py-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-text-secondary">Signatures gathered</span>
          <span className={cn('font-semibold', enough ? 'text-green' : 'text-text')}>
            {weight} of {need}
          </span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-text-muted/15 overflow-hidden">
          <div
            className={cn('h-full rounded-full', enough ? 'bg-green' : 'bg-primary')}
            style={{ width: `${Math.min(100, (weight / need) * 100)}%` }}
          />
        </div>
        <ul className="mt-2 space-y-0.5">
          {signing.signers.map((sg) => {
            const has = signed.includes(sg.key)
            return (
              <li key={sg.key} className="flex items-center justify-between text-[11px]">
                <span className={cn('font-mono', has ? 'text-text' : 'text-text-muted')}>
                  {short(sg.key)}
                  {sg.key === connected && ' (this wallet)'}
                </span>
                <span className={has ? 'text-green' : 'text-text-muted'}>{has ? 'signed' : 'not yet'}</span>
              </li>
            )
          })}
        </ul>
      </div>

      {tooMany && (
        <p className="text-[11px] text-coral">
          This transaction carries more signatures than the quorum needs, which the network rejects.
          Start it again and gather exactly {need}.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {connectedIsSigner && !signed.includes(connected) && (
          <button
            onClick={signMine}
            disabled={busy !== 'idle' || blocked}
            className="px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-40"
          >
            {busy === 'signing' ? 'Awaiting signature...' : 'Sign your part'}
          </button>
        )}
        <button
          type="button"
          onClick={() => setPasteOpen((v) => !v)}
          className="px-4 py-2 rounded-full border border-text-muted/20 text-sm text-text-secondary hover:bg-bg"
        >
          Paste a signed copy
        </button>
        <CopyButton value={working} what="the transaction to send to another signer" />
      </div>

      {!connectedIsSigner && (
        <p className="text-[11px] text-text-muted">
          This wallet is not one of the signers on this account. Connect a signer wallet to add its
          signature, or paste a copy signed elsewhere.
        </p>
      )}

      {pasteOpen && (
        <div className="space-y-2">
          <textarea
            value={pasteVal}
            onChange={(e) => setPasteVal(e.target.value)}
            placeholder="Paste the transaction another signer sent back"
            rows={3}
            className="w-full bg-bg rounded-lg px-3 py-2 text-xs font-mono outline-none focus:ring-1 focus:ring-primary/30 break-all"
          />
          <button
            onClick={applyPaste}
            disabled={!pasteVal.trim()}
            className="px-3 py-1.5 rounded-full bg-bg-card border border-text-muted/20 text-xs disabled:opacity-40"
          >
            Add this signature
          </button>
        </div>
      )}

      <button
        onClick={doSubmit}
        disabled={busy !== 'idle' || !enough || tooMany || blocked}
        className="w-full px-4 py-2.5 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {busy === 'submitting' ? 'Submitting...' : enough ? 'Submit' : `Need ${need - weight} more signature${need - weight === 1 ? '' : 's'}`}
      </button>

      {err && <p className="text-xs text-coral break-words">{err}</p>}
    </div>
  )
}
