import { useState } from 'react'
import { cn } from '../utils/format'

interface Props {
  open: boolean
  onClose: () => void
}

const CHAINS = [
  { id: 'stellar', name: 'Stellar (direct)', icon: '✦' },
  { id: 'ethereum', name: 'Ethereum → Stellar', icon: 'Ξ', bridge: true },
  { id: 'arbitrum', name: 'Arbitrum → Stellar', icon: '◆', bridge: true },
  { id: 'base', name: 'Base → Stellar', icon: '●', bridge: true },
]

export default function DepositModal({ open, onClose }: Props) {
  const [chain, setChain] = useState('stellar')
  const [amount, setAmount] = useState('')
  const [step, setStep] = useState(0) // 0=form, 1=confirming, 2=done

  if (!open) return null

  const selectedChain = CHAINS.find(c => c.id === chain)
  const isBridge = selectedChain?.bridge

  const handleDeposit = () => {
    setStep(1)
    // simulate confirmation delay
    setTimeout(() => setStep(2), 2500)
  }

  const handleClose = () => {
    setStep(0)
    setAmount('')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={handleClose}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
      <div
        className="relative bg-bg-card rounded-3xl p-6 w-full max-w-md mx-4"
        style={{ border: '1px solid rgba(13, 45, 76, 0.1)', boxShadow: '0 25px 60px rgba(8, 10, 12, 0.15)' }}
        onClick={e => e.stopPropagation()}
      >
        {step === 2 ? (
          <div className="text-center py-6">
            <div className="w-12 h-12 rounded-full bg-green/10 flex items-center justify-center mx-auto mb-4">
              <span className="text-green text-xl">✓</span>
            </div>
            <h3 className="text-lg font-semibold text-text mb-2">Deposit initiated</h3>
            <p className="text-sm text-text-secondary mb-1">
              {isBridge ? `Bridging ${amount} USDC from ${selectedChain?.name.split(' →')[0]}` : `Depositing ${amount} USDC`}
            </p>
            {isBridge && <p className="text-xs text-text-muted">Estimated bridge time: ~2 min via Allbridge Core</p>}
            <button onClick={handleClose} className="mt-6 px-6 py-2 rounded-full bg-primary text-white text-sm font-medium">
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-text">Deposit Funds</h3>
              <button onClick={handleClose} className="text-text-muted hover:text-text text-lg">✕</button>
            </div>

            {/* source chain */}
            <div className="mb-4">
              <label className="text-xs text-text-secondary font-medium mb-2 block">Source</label>
              <div className="grid grid-cols-2 gap-2">
                {CHAINS.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setChain(c.id)}
                    className={cn(
                      'px-3 py-2.5 rounded-xl text-xs font-medium text-left transition-all flex items-center gap-2',
                      chain === c.id
                        ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                        : 'bg-bg text-text-secondary hover:bg-bg/80'
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
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-3 rounded-xl bg-bg text-text text-sm outline-none focus:ring-1 focus:ring-primary/30"
                style={{ border: '1px solid rgba(13, 45, 76, 0.08)' }}
              />
            </div>

            {/* info */}
            {isBridge && (
              <div className="mb-4 px-3 py-2.5 rounded-xl bg-primary/5 text-xs text-text-secondary space-y-1">
                <div className="flex justify-between"><span>Bridge provider</span><span className="text-text font-medium">Allbridge Core</span></div>
                <div className="flex justify-between"><span>Bridge fee</span><span className="text-text">0.15%</span></div>
                <div className="flex justify-between"><span>Est. time</span><span className="text-text">~2 min</span></div>
                <div className="flex justify-between"><span>Trustline</span><span className="text-green font-medium">Active</span></div>
              </div>
            )}

            {!isBridge && (
              <div className="mb-4 px-3 py-2.5 rounded-xl bg-primary/5 text-xs text-text-secondary space-y-1">
                <div className="flex justify-between"><span>Tx fee</span><span className="text-text">~$0.00015</span></div>
                <div className="flex justify-between"><span>Strategy</span><span className="text-text font-medium">XLM/USDC Optimizer</span></div>
              </div>
            )}

            <button
              onClick={handleDeposit}
              disabled={!amount || Number(amount) <= 0 || step === 1}
              className="w-full py-3 rounded-full bg-primary text-white font-semibold text-sm transition-all hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {step === 1 ? 'Confirming...' : isBridge ? 'Bridge & Deposit' : 'Deposit'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
