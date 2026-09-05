import { useState } from 'react'

import { useCustody, type CustodyMode } from '../contexts/CustodyContext'
import { cn } from '../utils/format'
import { InfoTip } from './InfoTip'

const OPTIONS: Array<{ value: CustodyMode; label: string; sub: string; badge?: string }> = [
  { value: 'wallet-kit', label: 'Browser wallet', sub: 'sign with Freighter, LOBSTR, xBull or Albedo' },
  {
    value: 'dfns',
    label: 'DFNS (Lobster demo)',
    sub: 'a shared testnet sandbox to try institutional custody, not your own DFNS org',
    badge: 'Testnet sandbox',
  },
]

export default function CustodyModeToggle() {
  const { mode, setMode } = useCustody()
  const [showByo, setShowByo] = useState(false)

  return (
    <div className="rounded-3xl p-5 bg-bg-card card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text">
          Custody mode <InfoTip term="custody" label="custody" />
        </h3>
        <span className="text-xs text-text-muted">saved in this browser</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {OPTIONS.map((opt) => {
          const active = mode === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => setMode(opt.value)}
              className={cn(
                'rounded-2xl px-3 py-3 text-left border transition-colors',
                active
                  ? 'border-primary bg-primary/5 text-text'
                  : 'border-text-muted/20 hover:bg-bg text-text-secondary',
              )}
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <span
                  className={cn(
                    'inline-block w-2.5 h-2.5 rounded-full',
                    active ? 'bg-primary' : 'bg-text-muted/40',
                  )}
                />
                {opt.label}
                {opt.badge && (
                  <span className="ml-auto rounded-full bg-amber-500/10 text-amber-500 text-[10px] font-semibold px-2 py-0.5">
                    {opt.badge}
                  </span>
                )}
              </div>
              <p className="text-xs text-text-muted mt-1">{opt.sub}</p>
            </button>
          )
        })}
      </div>

      {mode === 'dfns' && (
        <div className="mt-3 rounded-2xl bg-amber-500/10 text-amber-600 px-3 py-2.5 text-xs">
          You are signing through Lobster's shared demo custody on testnet. It shows the
          institutional flow end to end. It is not your organization's own DFNS, and it never
          holds mainnet funds for you.
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowByo((v) => !v)}
        className="mt-3 text-xs text-primary hover:underline"
      >
        {showByo ? 'Hide' : 'Connect your own DFNS'}
      </button>
      {showByo && (
        <div className="mt-2 rounded-2xl bg-bg px-3 py-3 text-xs text-text-secondary space-y-2">
          <p>
            To run custody on your own DFNS instead of this sandbox, you connect your
            organization's DFNS. There is no key to paste here, and there never will be. What it
            takes:
          </p>
          <ul className="list-disc pl-4 space-y-1">
            <li>
              your own DFNS organization. DFNS sets these up with you, there is no self-serve
              sign-up yet.
            </li>
            <li>a service account scoped to read wallets and sign on one treasury wallet, nothing wider</li>
            <li>the treasury wallet you want Lobster to watch, on testnet first, then mainnet</li>
            <li>your own approvers and the approval rule you want held on payouts</li>
          </ul>
          <p>
            Your signing key stays inside your DFNS. Lobster orchestrates and can be turned off at
            any time. Talk to the team to switch this on for your organization.
          </p>
        </div>
      )}
    </div>
  )
}
