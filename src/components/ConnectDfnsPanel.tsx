import { useState } from 'react'

import { removeClientProfile, setActiveProfile, relayHost, DEMO_PROFILE_ID } from '../integrations/dfns/profiles'
import { useProfiles, useActiveProfile } from '../integrations/dfns/use-profiles'
import { cn } from '../utils/format'
import ConnectRelayForm from './ConnectRelayForm'

export default function ConnectDfnsPanel() {
  const profiles = useProfiles()
  const active = useActiveProfile()
  const [open, setOpen] = useState(false)

  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {profiles.map((p) => {
          const isActive = active?.id === p.id
          return (
            <li
              key={p.id}
              className={cn(
                'flex items-center justify-between gap-2 rounded-xl px-3 py-2 border transition-colors',
                isActive ? 'border-primary bg-primary/5' : 'border-text-muted/20 hover:bg-bg',
              )}
            >
              <button
                type="button"
                onClick={() => setActiveProfile(p.id)}
                className="flex items-center gap-2 min-w-0 flex-1 text-left"
              >
                <span
                  className={cn('inline-block w-2 h-2 rounded-full shrink-0', isActive ? 'bg-primary' : 'bg-text-muted/40')}
                />
                <span className="truncate">
                  <span className="text-sm text-text">{p.label}</span>
                  {p.kind === 'client' && (
                    <span className="ml-2 text-[10px] text-text-muted font-mono">{relayHost(p.relayBaseUrl)}</span>
                  )}
                </span>
              </button>
              {p.kind === 'demo' ? (
                <span className="shrink-0 rounded-full bg-amber-500/10 text-amber-500 text-[10px] font-semibold px-2 py-0.5">
                  Testnet sandbox
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => removeClientProfile(p.id)}
                  className="shrink-0 text-[11px] text-text-muted hover:text-coral"
                >
                  Forget
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="text-xs text-primary hover:underline">
          Connect a DFNS relay
        </button>
      ) : (
        <ConnectRelayForm onSaved={() => setOpen(false)} onCancel={() => setOpen(false)} />
      )}

      {active?.id === DEMO_PROFILE_ID && (
        <p className="text-[10px] text-amber-600">
          You are on the Lobster demo relay on testnet. It is a shared sandbox, not your custody.
        </p>
      )}
    </div>
  )
}
