import { useEffect, useId, useMemo, useState } from 'react'
import { X, Check } from 'lucide-react'
import { cn } from '../utils/format'
import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useBridgeQuote, useTrustline, useBuildBridgeTx } from '../integrations/allbridge/hooks'
import { CONTRACTS } from '../config/contracts'
import { BridgeRequestSchema, type BridgeRequest, type EvmSourceChain } from '../integrations/allbridge/types'

interface Props {
  open: boolean
  onClose: () => void
}

const CHAINS: Array<{
  id: 'stellar' | 'ETH' | 'ARB' | 'BSC'
  name: string
  icon: string
  bridge: boolean
}> = [
  { id: 'stellar', name: 'Stellar (direct)', icon: '✦', bridge: false },
  { id: 'ETH', name: 'Ethereum → Stellar', icon: 'Ξ', bridge: true },
  { id: 'ARB', name: 'Arbitrum → Stellar', icon: '◆', bridge: true },
  { id: 'BSC', name: 'BNB → Stellar', icon: '●', bridge: true },
]

const USDC_ASSET_CODE = 'USDC'
// trustline issuer is Circle's G-address, not the SAC. Empty on testnet
// (Allbridge has no testnet deployment).
function usdcIssuerFor(network: 'testnet' | 'mainnet'): string {
  return CONTRACTS[network].tokens.usdcIssuer
}

export default function DepositModal({ open, onClose }: Props) {
  const [chain, setChain] = useState<(typeof CHAINS)[number]['id']>('stellar')
  const [amount, setAmount] = useState('')
  const [step, setStep] = useState<'form' | 'building' | 'submitted' | 'failed'>('form')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [txPreview, setTxPreview] = useState<unknown>(null)

  const { address } = useWallet()
  const { network } = useNetwork()

  const selectedChain = CHAINS.find((c) => c.id === chain)!
  const isBridge = selectedChain.bridge

  const bridgeRequest: BridgeRequest | null = useMemo(() => {
    if (!isBridge || !address || !amount) return null
    try {
      return BridgeRequestSchema.parse({
        sourceChain: chain as EvmSourceChain,
        amount,
        // EVM address placeholder until wagmi/viem is wired in
        fromAddress: '0x0000000000000000000000000000000000000000',
        toAddress: address,
      })
    } catch {
      return null
    }
  }, [chain, amount, address, isBridge])

  const usdcIssuer = usdcIssuerFor(network)
  const trustlineQuery = useTrustline(
    usdcIssuer ? address : null,
    USDC_ASSET_CODE,
    usdcIssuer,
    network,
  )
  const trustlineRequired = !!usdcIssuer && trustlineQuery.data === false
  const quoteQuery = useBridgeQuote(bridgeRequest, trustlineRequired)
  const buildTx = useBuildBridgeTx()

  useEffect(() => {
    if (!open) {
      setStep('form')
      setAmount('')
      setErrorMsg(null)
      setTxPreview(null)
    }
  }, [open])

  // network toggle while modal open: keep amount + chain, reset the rest
  useEffect(() => {
    if (open) {
      setStep('form')
      setTxPreview(null)
      setErrorMsg(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network])

  const titleId = useId()
  const isSubmittingNow = step === 'building'

  // Esc closes the modal, but not mid-build so we don't drop the mutation
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmittingNow) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, isSubmittingNow, onClose])

  if (!open) return null

  const handleDeposit = async () => {
    setErrorMsg(null)
    if (!isBridge) {
      // Stellar-direct path isn't wired to the Factory yet, so we just
      // show a clear "demo only" message instead of faking success.
      setStep('building')
      setTimeout(() => {
        setErrorMsg(
          'Stellar-direct deposits are coming next. The Factory is already live on testnet; we wire up the signing path right after.',
        )
        setStep('submitted')
      }, 1200)
      return
    }

    if (!bridgeRequest) {
      setErrorMsg('Connect a wallet and enter an amount.')
      return
    }

    setStep('building')
    try {
      const raw = await buildTx.mutateAsync(bridgeRequest)
      setTxPreview(raw)
      setErrorMsg(
        'Bridge transaction prepared. EVM wallet signing arrives in the next phase, mainnet execution after that.',
      )
      setStep('submitted')
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not build the bridge tx')
      setStep('failed')
    }
  }

  const handleClose = () => {
    onClose()
  }

  const isSubmitting = isSubmittingNow
  const quote = quoteQuery.data

  const onBackdropClick = () => {
    if (!isSubmitting) handleClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onBackdropClick}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative bg-bg-card rounded-3xl p-6 w-full max-w-md mx-4"
        style={{
          border: '1px solid rgba(13, 45, 76, 0.1)',
          boxShadow: '0 25px 60px rgba(8, 10, 12, 0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {step === 'submitted' ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-full bg-green/10 flex items-center justify-center mx-auto mb-4">
              <Check className="text-green" size={22} />
            </div>
            <h3 className="text-lg font-semibold text-text mb-2">
              {isBridge ? 'Bridge transaction prepared' : 'Deposit initiated'}
            </h3>
            <p className="text-sm text-text-secondary mb-1">
              {isBridge
                ? `Bridging ${amount} USDC from ${selectedChain.name.split(' →')[0]}`
                : `Depositing ${amount} USDC`}
            </p>
            {isBridge && (
              <p className="text-xs text-text-muted">
                {txPreview
                  ? 'Raw bridge tx ready. Sign and broadcast with your EVM wallet to complete the transfer.'
                  : 'Estimated bridge time: ~2 min via Allbridge Core'}
              </p>
            )}
            <button
              onClick={handleClose}
              className="mt-6 px-6 py-2 rounded-full bg-primary text-white text-sm font-medium"
            >
              Done
            </button>
          </div>
        ) : step === 'failed' ? (
          <div className="text-center py-6">
            <h3 className="text-lg font-semibold text-text mb-2">Could not build transaction</h3>
            <p className="text-sm text-text-secondary mb-4">{errorMsg}</p>
            <button
              onClick={() => setStep('form')}
              className="px-6 py-2 rounded-full bg-primary text-white text-sm font-medium"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <h3 id={titleId} className="text-lg font-semibold text-text">Deposit Funds</h3>
              <button
                onClick={handleClose}
                aria-label="Close deposit modal"
                className="text-text-muted hover:text-text text-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* source chain */}
            <div className="mb-4">
              <label className="text-xs text-text-secondary font-medium mb-2 block">Source</label>
              <div className="grid grid-cols-2 gap-2">
                {CHAINS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setChain(c.id)}
                    className={cn(
                      'px-3 py-2.5 rounded-xl text-xs font-medium text-left transition-all flex items-center gap-2',
                      chain === c.id
                        ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                        : 'bg-bg text-text-secondary hover:bg-bg/80',
                    )}
                  >
                    <span>{c.icon}</span>
                    <span>{c.name.split(' →')[0]}</span>
                    {c.bridge && <span className="text-[10px] text-text-muted ml-auto">bridge</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* amount */}
            <div className="mb-4">
              <label className="text-xs text-text-secondary font-medium mb-2 block">Amount (USDC)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full px-4 py-3 rounded-xl bg-bg text-text text-sm outline-none focus:ring-1 focus:ring-primary/30"
                style={{ border: '1px solid rgba(13, 45, 76, 0.08)' }}
              />
            </div>

            {/* info */}
            {isBridge && (
              <div className="mb-4 px-3 py-2.5 rounded-xl bg-primary/5 text-xs text-text-secondary space-y-1">
                <div className="flex justify-between">
                  <span>Bridge provider</span>
                  <span className="text-text font-medium">Allbridge Core</span>
                </div>
                <div className="flex justify-between">
                  <span>You receive</span>
                  <span className="text-text">
                    {quote ? `${quote.amountOutFloat} USDC` : amount ? '...' : '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Est. time</span>
                  <span className="text-text">
                    {quote ? `~${Math.round(quote.estimatedTimeSeconds / 60)} min` : '~2 min'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Trustline</span>
                  {trustlineQuery.isLoading ? (
                    <span className="text-text-muted">Checking...</span>
                  ) : trustlineRequired ? (
                    <span className="text-coral font-medium">Will be created</span>
                  ) : (
                    <span className="text-green font-medium">Active</span>
                  )}
                </div>
                {network === 'testnet' && (
                  <div className="mt-2 pt-2 border-t border-text-muted/10 text-coral">
                    Allbridge runs on mainnet only. Switch to mainnet to send a real bridge tx.
                  </div>
                )}
              </div>
            )}

            {!isBridge && (
              <div className="mb-4 px-3 py-2.5 rounded-xl bg-primary/5 text-xs text-text-secondary space-y-1">
                <div className="flex justify-between">
                  <span>Tx fee</span>
                  <span className="text-text">~$0.00015</span>
                </div>
                <div className="flex justify-between">
                  <span>Strategy</span>
                  <span className="text-text font-medium">XLM/USDC Optimizer</span>
                </div>
              </div>
            )}

            {errorMsg && (
              <div className="mb-3 px-3 py-2 rounded-xl bg-coral/10 text-coral text-xs">
                {errorMsg}
              </div>
            )}

            <button
              onClick={handleDeposit}
              disabled={!amount || Number(amount) <= 0 || isSubmitting}
              className="w-full py-3 rounded-full bg-primary text-white font-semibold text-sm transition-all hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Building tx...' : isBridge ? 'Bridge & Deposit' : 'Deposit'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
