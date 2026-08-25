import { useCustody, type CustodyMode } from '../contexts/CustodyContext'
import { cn } from '../utils/format'
import { InfoTip } from './InfoTip'

const OPTIONS: Array<{ value: CustodyMode; label: string; sub: string }> = [
  { value: 'wallet-kit', label: 'Browser wallet', sub: 'sign with Freighter, LOBSTR, xBull or Albedo' },
  { value: 'dfns', label: 'DFNS MPC', sub: 'keys held by DFNS, an institutional custody provider' },
]

export default function CustodyModeToggle() {
  const { mode, setMode } = useCustody()

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
              </div>
              <p className="text-xs text-text-muted mt-1">{opt.sub}</p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
