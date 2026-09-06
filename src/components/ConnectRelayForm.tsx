import { useState } from 'react'

import { addClientProfile, setProfileOperatorToken, relayHost } from '../integrations/dfns/profiles'
import { verifyRelay } from '../integrations/dfns/verify-relay'

type Phase =
  | { k: 'form' }
  | { k: 'verifying' }
  | { k: 'verified'; wallets: number }
  | { k: 'failed'; msg: string }

interface Props {
  // called with the new profile id once it is saved and made active.
  onSaved?: (profileId: string) => void
  onCancel?: () => void
}

// the connect-a-relay form, shared by the Audit custody panel and the top-bar
// "+ MPC" control. it saves a client profile (never the demo) and, when given,
// its operator token; the DFNS key never passes through here.
export default function ConnectRelayForm({ onSaved, onCancel }: Props) {
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
      const p = addClientProfile({
        label: label.trim() || relayHost(url.trim()),
        relayBaseUrl: url.trim(),
        apiToken: readToken.trim(),
      })
      if (opToken.trim()) setProfileOperatorToken(p, opToken.trim())
      onSaved?.(p.id)
    } catch (e) {
      setPhase({ k: 'failed', msg: e instanceof Error ? e.message : 'could not save' })
    }
  }

  return (
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
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-text-muted hover:text-text">
            Cancel
          </button>
        )}
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
  )
}
