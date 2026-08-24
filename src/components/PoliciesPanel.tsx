import { useDfnsPolicies } from '../integrations/dfns/hooks'
import { Card, CardHead, Disclosure, Empty } from './ui'

// A policy that is not Active cannot hold anything back, so the live ones lead
// and the retired ones go behind a fold. Showing seven rows at equal weight hid
// the single policy that actually gates signing.
const LIVE = 'Active'

export default function PoliciesPanel() {
  const policies = useDfnsPolicies()

  if (!import.meta.env.VITE_LOBSTER_API_URL) {
    return null
  }

  const items = policies.data?.items ?? []
  const active = items.filter((p) => p.status === LIVE)
  const retired = items.filter((p) => p.status !== LIVE)

  return (
    <Card>
      <CardHead
        title="Signing policies"
        note="Rules the DFNS side applies before a key signs. Only active ones can hold a transaction for approval."
        meta={
          <span className="text-xs text-text-muted">
            {active.length} active of {items.length}
          </span>
        }
      />

      {policies.isLoading ? (
        <p className="text-xs text-text-muted">Loading...</p>
      ) : policies.isError ? (
        <p className="text-xs text-coral">{(policies.error as Error).message}</p>
      ) : items.length === 0 ? (
        <Empty>No policy configured on this DFNS account.</Empty>
      ) : (
        <div className="space-y-3">
          {active.length === 0 ? (
            <p className="text-xs text-coral">
              No active policy. Signing is not gated by an approver right now.
            </p>
          ) : (
            <ul className="space-y-2">
              {active.map((p) => (
                <li key={p.id} className="rounded-2xl bg-primary/5 px-3 py-2.5">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <span className="text-xs font-medium text-text">{p.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-green/15 text-green">
                      active
                    </span>
                  </div>
                  <div className="text-[11px] text-text-secondary mt-1">
                    {p.rule.kind} then {p.action.kind}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {retired.length > 0 && (
            <Disclosure summary={`${retired.length} retired`}>
              <ul className="divide-y divide-border">
                {retired.map((p) => (
                  <li key={p.id} className="py-2 flex items-center justify-between gap-3 text-xs">
                    <span className="text-text-secondary truncate">{p.name}</span>
                    <span className="text-text-muted shrink-0">{p.status.toLowerCase()}</span>
                  </li>
                ))}
              </ul>
            </Disclosure>
          )}
        </div>
      )}
    </Card>
  )
}
