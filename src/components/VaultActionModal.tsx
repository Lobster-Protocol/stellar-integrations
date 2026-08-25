import { useEffect, useId, useRef, useState } from 'react'
import { X } from 'lucide-react'

import { walletKitSigner } from '../integrations/signer/wallet-kit-signer'
import { networkPassphrase } from '../integrations/lobster/client'
import { buildVaultActionTx, submitSignedXdr, waitForTx, type VaultAction } from '../integrations/lobster/vault-tx'
import type { VaultPosition } from '../integrations/lobster/position'
import type { Network } from '../integrations/lobster/types'
import { stellarExplorer, formatBalance, cn } from '../utils/format'
import TokenRef from './TokenRef'

type Phase =
  | { k: 'form' }
  | { k: 'building' }
  | { k: 'signing' }
  | { k: 'submitting' }
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

  useEffect(() => {
    if (!open) {
      setAmount0('')
      setAmount1('')
      setPhase({ k: 'form' })
    }
  }, [open])

  if (!open) return null

  const isWithdraw = action === 'withdraw'
  const over0 = isWithdraw && amount0 !== '' && Number(amount0) > Number(vault.amount0)
  const over1 = isWithdraw && amount1 !== '' && Number(amount1) > Number(vault.amount1)
  const nothing =
    (amount0 === '' || Number(amount0) === 0) && (amount1 === '' || Number(amount1) === 0)
  const busy = phase.k === 'building' || phase.k === 'signing' || phase.k === 'submitting'

  async function run() {
    if (inFlight.current || nothing || over0 || over1) return
    inFlight.current = true
    try {
      setPhase({ k: 'building' })
      const built = await buildVaultActionTx(network, vault.address, action, caller, amount0 || '0', amount1 || '0')
      if (!built.xdr) {
        setPhase({ k: 'failed', msg: "This vault's storage has expired on-chain and needs restoring before this call." })
        return
      }
      setPhase({ k: 'signing' })
      const { signedTxXdr } = await walletKitSigner.signTransaction(built.xdr, {
        networkPassphrase: networkPassphrase(network),
        address: caller,
      })
      if (!signedTxXdr) throw new Error('the wallet did not return a signed transaction')
      setPhase({ k: 'submitting' })
      const hash = await submitSignedXdr(network, signedTxXdr)
      const final = await waitForTx(network, hash)
      if (final.status === 'SUCCESS') {
        setPhase({ k: 'done', hash })
        onDone()
      } else {
        setPhase({ k: 'failed', msg: `The network reported ${final.status}.` })
      }
    } catch (err) {
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
        : phase.k === 'submitting'
          ? 'Submitting...'
          : isWithdraw
            ? 'Withdraw'
            : 'Deposit'

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => { if (!busy) onClose() }}>
      <div className="bg-bg-card rounded-3xl p-6 w-full max-w-md card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 id={titleId} className="text-lg font-semibold text-text">
            {isWithdraw ? 'Withdraw from vault' : 'Deposit into vault'}
          </h2>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-full hover:bg-bg text-text-muted">
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
        ) : (
          <div className="space-y-3">
            {[0, 1].map((i) => {
              const tokenId = i === 0 ? vault.token0 : vault.token1
              const value = i === 0 ? amount0 : amount1
              const set = i === 0 ? setAmount0 : setAmount1
              const held = i === 0 ? vault.amount0 : vault.amount1
              const over = i === 0 ? over0 : over1
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-text-secondary flex items-center gap-1">
                      <TokenRef id={tokenId} />
                    </label>
                    {isWithdraw && (
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
                    <p className="text-[11px] text-coral mt-1">More than the vault holds ({formatBalance(held)}).</p>
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

            {phase.k === 'failed' && (
              <p className="text-xs text-coral break-words">{phase.msg}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
