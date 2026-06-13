import { useDfnsPolicies, useDfnsWallets } from '../integrations/dfns/hooks'
import { shortenAddress } from '../utils/format'

export default function PoliciesPanel() {
  const policies = useDfnsPolicies()
  const wallets = useDfnsWallets()

  return (
    <div className="rounded-3xl p-5 bg-bg-card card">
      <h3 className="text-sm font-semibold text-text mb-3">MPC policies & wallets</h3>

      {!import.meta.env.VITE_LOBSTER_API_URL ? (
        <p className="text-xs text-text-muted">
          Set VITE_LOBSTER_API_URL to point at the Hono custody service to load policies.
        </p>
      ) : policies.isLoading || wallets.isLoading ? (
        <p className="text-xs text-text-muted">Loading...</p>
      ) : policies.isError || wallets.isError ? (
        <p className="text-xs text-coral">
          {(policies.error as Error | null)?.message ??
            (wallets.error as Error | null)?.message ??
            'failed to load'}
        </p>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wide text-text-muted">Wallets</span>
              <span className="text-xs text-text-muted">{wallets.data?.items.length ?? 0}</span>
            </div>
            <ul className="divide-y divide-text-muted/10">
              {(wallets.data?.items ?? []).map((w) => (
                <li key={w.id} className="py-2 flex items-center justify-between text-xs">
                  <span className="text-text">{w.name || 'unnamed'}</span>
                  <span className="font-mono text-text-secondary">{shortenAddress(w.address)}</span>
                  <span className="text-text-muted">{w.network}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wide text-text-muted">Policies</span>
              <span className="text-xs text-text-muted">{policies.data?.items.length ?? 0}</span>
            </div>
            <ul className="divide-y divide-text-muted/10">
              {(policies.data?.items ?? []).map((p) => (
                <li key={p.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                  <span className="text-text truncate">{p.name}</span>
                  <span className="text-text-secondary">{p.rule.kind}</span>
                  <span className="text-text-muted">{p.action.kind}</span>
                  <span className="text-text-muted">{p.status}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
