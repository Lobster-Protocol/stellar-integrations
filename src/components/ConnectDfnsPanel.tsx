import { useState } from 'react'

import {
  addClientProfile,
  removeClientProfile,
  setActiveProfile,
  setProfileOperatorToken,
  assertRelayUrl,
  relayHost,
  DEMO_PROFILE_ID,
} from '../integrations/dfns/profiles'
import { useProfiles, useActiveProfile } from '../integrations/dfns/use-profiles'
import { cn } from '../utils/format'

type Phase =
  | { k: 'form' }
  | { k: 'verifying' }
  | { k: 'verified'; wallets: number }
  | { k: 'failed'; msg: string }

// verifies a relay the operator has not saved yet: reach its /health, then read
// its wallets with the read token. done with a raw fetch to the typed url, not
// relayFetch, since there is no active profile for it yet.
async function verifyRelay(url: string, readToken: string): Promise<number> {
  assertRelayUrl(url, 'client')
  let health: Response
  try {
    health = await fetch(`${url}/health`)
  } catch {
    throw new Error(
      'The browser could not reach that relay. It has to be running, served over https, and set DASHBOARD_ORIGIN to this dashboard so the browser is allowed to call it.',
    )
  }
  if (!health.ok) throw new Error(`The relay answered ${health.status} for /health.`)
  const w = await fetch(`${url}/dfns/wallets`, {
    headers: readToken ? { 'x-lobster-token': readToken } : undefined,
  })
  if (w.status === 401) throw new Error('The relay answered but turned down the read. Check the read token.')
  if (!w.ok) throw new Error(`The relay answered ${w.status} for the wallet read.`)
  const body = (await w.json().catch(() => ({}))) as { items?: unknown[] }
  return body.items?.length ?? 0
}

export default function ConnectDfnsPanel() {
  const profiles = useProfiles()
  const active = useActiveProfile()

  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const [readToken, setReadToken] = useState('')
  const [opToken, setOpToken] = useState('')
  const [phase, setPhase] = useState<Phase>({ k: 'form' })

  async function runVerify() {
    setPhase({ k: 'verifying' })
    try {
      const wallets = await verifyRelay(url.trim(), readToken.trim())
      setPhase({ k: 'verified', wallets })
    } catch (e) {
      setPhase({ k: 'failed', msg: e instanceof Error ? e.message : 'verification failed' })
    }
  }

  function save() {
    try {
      const p = addClientProfile({ label: label.trim() || relayHost(url.trim()), relayBaseUrl: url.trim(), apiToken: readToken.trim() })
      if (opToken.trim()) setProfileOperatorToken(p, opToken.trim())
      setOpen(false)
      setLabel('')
      setUrl('')
      setReadToken('')
      setOpToken('')
      setPhase({ k: 'form' })
    } catch (e) {
      setPhase({ k: 'failed', msg: e instanceof Error ? e.message : 'could not save' })
    }
  }

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
        <div className="rounded-2xl bg-bg px-3 py-3 space-y-2 text-xs">
          <div className="rounded-xl bg-amber-500/10 text-amber-600 px-3 py-2 text-[11px]">
            Enter only a relay you run yourself. The dashboard sends this address your tokens and the
            transactions you ask it to sign, so treat it like your own backend. Your DFNS key stays
            inside your own DFNS, reached through your relay. There is no key to paste here.
          </div>

          <label className="block text-text-secondary">
            Name
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Acme treasury"
              className="mt-1 w-full bg-bg-card rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-primary/30"
            />
          </label>
          <label className="block text-text-secondary">
            Relay address
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value.trim())}
              placeholder="https://relay.your-company.com"
              className="mt-1 w-full bg-bg-card rounded-lg px-3 py-2 font-mono outline-none focus:ring-1 focus:ring-primary/30"
            />
          </label>
          <label className="block text-text-secondary">
            Read token
            <input
              type="password"
              value={readToken}
              onChange={(e) => setReadToken(e.target.value)}
              placeholder="LOBSTER_API_TOKEN"
              className="mt-1 w-full bg-bg-card rounded-lg px-3 py-2 font-mono outline-none focus:ring-1 focus:ring-primary/30"
            />
          </label>
          <label className="block text-text-secondary">
            Operator token (optional, for approving and creating wallets)
            <input
              type="password"
              value={opToken}
              onChange={(e) => setOpToken(e.target.value)}
              placeholder="LOBSTER_OPERATOR_TOKEN"
              className="mt-1 w-full bg-bg-card rounded-lg px-3 py-2 font-mono outline-none focus:ring-1 focus:ring-primary/30"
            />
            <span className="block text-[10px] text-text-muted mt-0.5">
              Kept in this tab only, never written to disk.
            </span>
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={runVerify}
              disabled={!url.trim() || phase.k === 'verifying'}
              className="px-3 py-1.5 rounded-full border border-text-muted/20 disabled:opacity-40"
            >
              {phase.k === 'verifying' ? 'Checking...' : 'Check the connection'}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={phase.k !== 'verified'}
              className="px-4 py-1.5 rounded-full bg-primary text-white font-semibold disabled:opacity-40"
            >
              Save profile
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-text-muted hover:text-text">
              Cancel
            </button>
          </div>

          {phase.k === 'verified' && (
            <p className="text-green">Your relay answered. Read {phase.wallets} wallet(s).</p>
          )}
          {phase.k === 'failed' && <p className="text-coral break-words">{phase.msg}</p>}
          <p className="text-[10px] text-text-muted">
            An amount cap or approval rule on your DFNS protects its API transfers only. A swap or a
            vault move goes as a raw signature that any policy holds for approval, never a dollar cap.
          </p>
        </div>
      )}

      {active?.id === DEMO_PROFILE_ID && (
        <p className="text-[10px] text-amber-600">
          You are on the Lobster demo relay on testnet. It is a shared sandbox, not your custody.
        </p>
      )}
    </div>
  )
}
