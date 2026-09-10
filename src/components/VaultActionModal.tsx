import { useEffect, useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'

import { useCustody } from '../contexts/CustodyContext'
import { awaitDfnsSignature } from '../integrations/dfns/await-signature'
import { networkPassphrase } from '../integrations/lobster/client'
import { buildVaultActionTx, submitSignedXdr, waitForTx, type VaultAction } from '../integrations/lobster/vault-tx'
import type { VaultPosition } from '../integrations/lobster/position'
import type { Network } from '../integrations/lobster/types'
import { getSorobanTokenBalance } from '../integrations/stellar/token-balance'
import { stroopsToDecimal } from '../integrations/stellar/amount'
import { stellarExplorer, formatBalance, cn } from '../utils/format'
import { useAccountSigning } from '../integrations/stellar/use-account-signing'
import { isMultisig, requiredWeight } from '../integrations/stellar/multisig'
import CoSignPanel from './CoSignPanel'
import TokenRef from './TokenRef'

// a quorum call has to gather signatures across people, so its envelope needs a
// timebound wide enough to survive that instead of the 60s single-sig default.
const MULTISIG_TIMEOUT_SECS = 3600

type Phase =
  | { k: 'form' }
  | { k: 'building' }
  | { k: 'signing' }
  | { k: 'submitting' }
  | { k: 'pending' }
  | { k: 'collecting'; xdr: string }
  | { k: 'done'; hash: string }
  | { k: 'failed'; msg: string }

interface Props {
  open: boolean
  onClose: () => void
  onDone: () => void
  network: Network
  caller: string
  vault: VaultPosition
  action: VaultAction
}

export default function VaultActionModal({ open, onClose, onDone, network, caller, vault, action }: Props) {
  const [amount0, setAmount0] = useState('')
  const [amount1, setAmount1] = useState('')
  const [phase, setPhase] = useState<Phase>({ k: 'form' })
  const inFlight = useRef(false)
  const titleId = useId()
  const { signer, dfnsAddress, mode } = useCustody()
  // in dfns mode the treasury signs, so the tx sources from it, not the connected
  // wallet, and dfns supplies the approval in place of any on-chain quorum.
  const isDfns = mode === 'dfns' && !!dfnsAddress
  const source = isDfns ? (dfnsAddress as string) : caller
  const signingQ = useAccountSigning(network, source)
  const multi = !isDfns && signingQ.data ? isMultisig(signingQ.data) : false

  // a deposit spends the two tokens out of `source`, so show what that wallet
  // actually holds of each. reading the SAC balance() covers XLM (its SAC) and
  // USDC alike, and works for the treasury address under dfns custody too. gated
  // to the deposit form so a withdraw never pays for two sims it won't use - it
  // reads the vault's own idle holdings instead, below.
  const walletHeld = useQuery({
    queryKey: ['vault-wallet-held', network, source, vault.token0, vault.token1],
    queryFn: async () => {
      const [b0, b1] = await Promise.all([
        getSorobanTokenBalance(network, vault.token0, source),
        getSorobanTokenBalance(network, vault.token1, source),
      ])
      return [
        b0 === null ? null : stroopsToDecimal(b0),
        b1 === null ? null : stroopsToDecimal(b1),
      ] as const
    },
    enabled: open && action === 'deposit' && !!source,
    staleTime: 20_000,
    retry: 1,
  })

  const abortRef = useRef<AbortController | null>(null)
  useEffect(() => () => abortRef.current?.abort(), [])

  useEffect(() => {
    if (!open) {
      setAmount0('')
      setAmount1('')
      setPhase({ k: 'form' })
    }
  }, [open])

  if (!open) return null

  const isWithdraw = action === 'withdraw'
  // what backs each amount input: the vault's idle holdings when withdrawing, the
  // funding wallet's balance when depositing. the deposit balance loads async and
  // getSorobanTokenBalance returns null for a zero balance, so a null cap reads as
  // "unknown / nothing to spend" and never blocks the form on its own.
  const held0 = isWithdraw ? vault.amount0 : walletHeld.data?.[0] ?? null
  const held1 = isWithdraw ? vault.amount1 : walletHeld.data?.[1] ?? null
  const over0 = held0 != null && amount0 !== '' && Number(amount0) > Number(held0)
  const over1 = held1 != null && amount1 !== '' && Number(amount1) > Number(held1)
  const nothing =
    (amount0 === '' || Number(amount0) === 0) && (amount1 === '' || Number(amount1) === 0)
  const busy = phase.k === 'building' || phase.k === 'signing' || phase.k === 'submitting' || phase.k === 'pending'

  async function run() {
    if (inFlight.current || nothing || over0 || over1) return
    inFlight.current = true
    // clear any controller from a previous attempt: a stale, already-aborted one
    // would make the catch below read a fresh real error as a Stop-waiting abort.
    abortRef.current = null
    try {
      setPhase({ k: 'building' })
      const built = await buildVaultActionTx(
        network,
        vault.address,
        action,
        source,
        amount0 || '0',
        amount1 || '0',
        multi || isDfns ? MULTISIG_TIMEOUT_SECS : 60,
      )
      if (!built.xdr) {
        setPhase({ k: 'failed', msg: "This vault's storage has expired on-chain and needs restoring before this call." })
        return
      }
      if (multi) {
        // a quorum account cannot go through on one signature, so hand the frozen
        // assembled envelope to the co-sign panel to gather the rest. never
        // rebuild it after this point or the collected signatures stop matching.
        setPhase({ k: 'collecting', xdr: built.xdr })
        return
      }
      setPhase({ k: 'signing' })
      const signed = await signer.signTransaction(built.xdr, {
        networkPassphrase: networkPassphrase(network),
        address: source,
      })
      // dfns held the call for a human approval: wait it out, then a soroban tx
      // lands as an envelope this submits and a classic one as a hash. the wallet
      // kit returns neither field, so this branch only runs under dfns custody.
      if (signed.pendingId) {
        setPhase({ k: 'pending' })
        const ac = new AbortController()
        abortRef.current = ac
        const hash = await awaitDfnsSignature(signed.pendingId, network, ac.signal)
        setPhase({ k: 'done', hash })
        onDone()
        return
      }
      if (signed.broadcastHash) {
        setPhase({ k: 'done', hash: signed.broadcastHash })
        onDone()
        return
      }
      if (!signed.signedTxXdr) throw new Error('the wallet did not return a signed transaction')
      setPhase({ k: 'submitting' })
      const hash = await submitSignedXdr(network, signed.signedTxXdr)
      const final = await waitForTx(network, hash)
      if (final.status === 'SUCCESS') {
        setPhase({ k: 'done', hash })
        onDone()
      } else {
        setPhase({ k: 'failed', msg: `The network reported ${final.status}.` })
      }
    } catch (err) {
      // a Stop-waiting click aborts the held-approval poll; that comes back as an
      // abort here, not a real failure, so drop back to the form quietly.
      if (abortRef.current?.signal.aborted) {
        setPhase({ k: 'form' })
        return
      }
      const msg = err instanceof Error ? err.message.split('\n')[0].slice(0, 180) : 'Something went wrong'
      setPhase({ k: 'failed', msg })
    } finally {
      inFlight.current = false
    }
  }

  const submitLabel =
    phase.k === 'building'
      ? 'Building...'
      : phase.k === 'signing'
        ? 'Awaiting signature...'
        : phase.k === 'pending'
          ? 'Awaiting approval...'
          : phase.k === 'submitting'
            ? 'Submitting...'
            : isWithdraw
              ? 'Withdraw'
              : 'Deposit'

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => { if (!busy) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="bg-bg-card rounded-3xl p-6 w-full max-w-md card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 id={titleId} className="text-lg font-semibold text-text">
            {isWithdraw ? 'Withdraw from vault' : 'Deposit into vault'}
          </h2>
          <button onClick={onClose} disabled={busy} aria-label="Close" className="p-1 rounded-full hover:bg-bg text-text-muted disabled:opacity-40 disabled:cursor-not-allowed">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-text-secondary mb-4">
          {isWithdraw
            ? 'Send the two tokens sitting idle in this vault back to your wallet.'
            : 'Move the two tokens from your wallet into this vault, ready to be put to work.'}
        </p>

        {phase.k === 'done' ? (
          <div className="text-center py-4">
            <div className="text-green font-medium mb-2">{isWithdraw ? 'Withdrawn' : 'Deposited'}</div>
            <a
              href={stellarExplorer(network, 'tx', phase.hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary hover:underline font-mono break-all"
            >
              {phase.hash}
            </a>
            <div>
              <button onClick={onClose} className="mt-5 px-6 py-2 rounded-full bg-primary text-white text-sm font-semibold">
                Done
              </button>
            </div>
          </div>
        ) : phase.k === 'collecting' ? (
          <div className="space-y-3">
            <p className="text-xs text-text-secondary">
              This account uses shared control. Your signature alone is not enough. Sign your part,
              then send the transaction to another signer, or paste their signed copy back here.
            </p>
            {signingQ.data && (
              <CoSignPanel
                network={network}
                signing={signingQ.data}
                baseXdr={phase.xdr}
                connected={caller}
                submit={async (xdr) => {
                  const hash = await submitSignedXdr(network, xdr)
                  const final = await waitForTx(network, hash)
                  if (final.status !== 'SUCCESS') throw new Error(`the network reported ${final.status}`)
                  return hash
                }}
                onSubmitted={(hash) => {
                  setPhase({ k: 'done', hash })
                  onDone()
                }}
              />
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {multi && signingQ.data && (
              <div className="rounded-2xl bg-amber-500/10 text-amber-600 px-3 py-2.5 text-[11px]">
                This account uses shared control. {requiredWeight(signingQ.data, 'med')} signatures
                approve each move.
              </div>
            )}
            {isDfns && (
              <div className="rounded-2xl bg-primary/5 text-primary px-3 py-2.5 text-[11px]">
                Your DFNS treasury signs this move, held for approval in your DFNS console.
              </div>
            )}
            {[0, 1].map((i) => {
              const tokenId = i === 0 ? vault.token0 : vault.token1
              const value = i === 0 ? amount0 : amount1
              const set = i === 0 ? setAmount0 : setAmount1
              const held = i === 0 ? held0 : held1
              const over = i === 0 ? over0 : over1
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-text-secondary flex items-center gap-1">
                      <TokenRef id={tokenId} />
                    </label>
                    {held != null && (
                      <button
                        type="button"
                        onClick={() => set(held)}
                        className="text-[11px] text-primary hover:underline"
                      >
                        max {formatBalance(held)}
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={value}
                    onChange={(e) => set(e.target.value)}
                    placeholder="0.0"
                    className={cn(
                      'w-full bg-bg rounded-lg px-3 py-2 text-sm font-mono outline-none focus:ring-1',
                      over ? 'ring-1 ring-coral' : 'focus:ring-primary/30',
                    )}
                  />
                  {over && (
                    <p className="text-[11px] text-coral mt-1">
                      {isWithdraw
                        ? `More than the vault holds (${formatBalance(held!)}).`
                        : `More than your ${formatBalance(held!)} balance.`}
                    </p>
                  )}
                </div>
              )
            })}

            <button
              onClick={run}
              disabled={busy || nothing || over0 || over1}
              className="w-full px-4 py-2.5 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {submitLabel}
            </button>

            {phase.k === 'pending' && (
              <div className="space-y-2">
                <p className="text-xs text-primary">
                  Waiting for approval in your DFNS console. Someone else has to approve it, then it
                  settles here.
                </p>
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className="text-[11px] text-text-muted hover:text-coral"
                >
                  Stop waiting
                </button>
              </div>
            )}
            {phase.k === 'failed' && (
              <p className="text-xs text-coral break-words">{phase.msg}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
