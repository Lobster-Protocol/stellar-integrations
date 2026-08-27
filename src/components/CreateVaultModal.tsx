import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'

import { walletKitSigner } from '../integrations/signer/wallet-kit-signer'
import { networkPassphrase } from '../integrations/lobster/client'
import { buildCreatePoolTx, submitSignedXdr, waitForTx } from '../integrations/lobster/factory-tx'
import { brokerAssetToSac } from '../integrations/broker/asset-mapping'
import { swapTokensFor } from '../config/contracts'
import type { Network } from '../integrations/lobster/types'
import { stellarExplorer } from '../utils/format'

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
}

function readableCreateError(msg: string): string {
  if (/already/i.test(msg)) {
    return 'You already have a vault for this exact pair. Open it from the list instead.'
  }
  if (/InvalidPoolTokens|same token/i.test(msg)) return 'Pick two different tokens.'
  return msg.split('\n')[0].slice(0, 180)
}

export default function CreateVaultModal({ open, onClose, onDone, network, caller }: Props) {
  const tokens = useMemo(() => swapTokensFor(network), [network])
  const [code0, setCode0] = useState(tokens[0]?.code ?? '')
  const [code1, setCode1] = useState(tokens[1]?.code ?? '')
  const [phase, setPhase] = useState<Phase>({ k: 'form' })
  const inFlight = useRef(false)

  useEffect(() => {
    if (!open) {
      setPhase({ k: 'form' })
      setCode0(tokens[0]?.code ?? '')
      setCode1(tokens[1]?.code ?? '')
    }
  }, [open, tokens])

  if (!open) return null

  const t0 = tokens.find((t) => t.code === code0) ?? tokens[0]
  const t1 = tokens.find((t) => t.code === code1) ?? tokens[1]
  const same = !!t0 && !!t1 && t0.code === t1.code
  const busy = phase.k === 'building' || phase.k === 'signing' || phase.k === 'submitting'

  async function run() {
    if (inFlight.current || same || !t0 || !t1) return
    const sac0 = brokerAssetToSac(t0.asset, network)
    const sac1 = brokerAssetToSac(t1.asset, network)
    if (!sac0 || !sac1) {
      setPhase({ k: 'failed', msg: 'Could not resolve one of the tokens to a contract on this network.' })
      return
    }
    inFlight.current = true
    try {
      setPhase({ k: 'building' })
      const built = await buildCreatePoolTx(network, caller, sac0, sac1)
      if (!built.xdr) {
        setPhase({ k: 'failed', msg: 'The Factory storage has expired on-chain and needs restoring first.' })
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
      setPhase({ k: 'failed', msg: readableCreateError(err instanceof Error ? err.message : 'Something went wrong') })
    } finally {
      inFlight.current = false
    }
  }

  const label =
    phase.k === 'building'
      ? 'Building...'
      : phase.k === 'signing'
        ? 'Awaiting signature...'
        : phase.k === 'submitting'
          ? 'Creating...'
          : 'Create vault'

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => { if (!busy) onClose() }}>
      <div className="bg-bg-card rounded-3xl p-6 w-full max-w-md card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-lg font-semibold text-text">Create a vault</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 rounded-full hover:bg-bg text-text-muted">
            <X size={18} />
          </button>
        </div>
        <p className="text-xs text-text-secondary mb-4">
          Deploy a new vault you own, for a pair of tokens. You can deposit into it right after.
        </p>

        {phase.k === 'done' ? (
          <div className="text-center py-4">
            <div className="text-green font-medium mb-2">Vault created</div>
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
            <div className="flex gap-2">
              <label className="text-xs text-text-secondary w-24 self-center">First token</label>
              <select value={t0?.code} onChange={(e) => setCode0(e.target.value)} className="flex-1 bg-bg rounded-lg px-3 py-2 text-sm">
                {tokens.map((t) => (
                  <option key={t.code} value={t.code}>{t.code}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <label className="text-xs text-text-secondary w-24 self-center">Second token</label>
              <select value={t1?.code} onChange={(e) => setCode1(e.target.value)} className="flex-1 bg-bg rounded-lg px-3 py-2 text-sm">
                {tokens.map((t) => (
                  <option key={t.code} value={t.code}>{t.code}</option>
                ))}
              </select>
            </div>

            {same && <p className="text-xs text-coral">Pick two different tokens.</p>}

            <p className="text-[11px] text-text-muted">
              Creating a vault deploys a contract on-chain, so it costs a network fee. Your wallet
              shows the exact amount before you sign.
            </p>

            <p className="text-[11px] text-text-muted">
              A vault cannot be deleted afterwards. The Factory has no way to unregister one, so it
              stays on your list for good. You can empty it and hide it from view.
            </p>

            <button
              onClick={run}
              disabled={busy || same}
              className="w-full px-4 py-2.5 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {label}
            </button>

            {phase.k === 'failed' && <p className="text-xs text-coral break-words">{phase.msg}</p>}
          </div>
        )}
      </div>
    </div>
  )
}
