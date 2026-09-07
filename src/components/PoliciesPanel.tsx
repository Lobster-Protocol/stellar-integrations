import { useDfnsPolicies, type DfnsPolicySummary } from '../integrations/dfns/hooks'
import { useHasActiveRelay } from '../integrations/dfns/use-profiles'
import { Card, CardHead, Disclosure, Empty, NotConfigured } from './ui'
import { InfoTip } from './InfoTip'

// A policy that is not Active cannot hold anything back, so the live ones lead
// and the retired ones go behind a fold. Showing seven rows at equal weight hid
// the single policy that actually gates signing.
const LIVE = 'Active'

// The DFNS rule/action objects carry the actual formulation. State it plainly and
// factually: the amount limit, the size of the recipient list, the approval quorum.
// The over/under direction of an amount rule is left out on purpose, it depends on
// the paired action and is easy to state wrong.
function ruleSummary(rule: DfnsPolicySummary['rule']): string {
  const c = rule.configuration
  if (rule.kind === 'TransactionAmountLimit' && c && c.limit != null) {
    const currency = typeof c.currency === 'string' ? ` ${c.currency}` : ''
    return `amount limit ${String(c.limit)}${currency}`
  }
  if (rule.kind === 'TransactionRecipientWhitelist' && c && Array.isArray(c.addresses)) {
    const n = c.addresses.length
    return `recipient whitelist (${n} address${n === 1 ? '' : 'es'})`
  }
  if (rule.kind === 'AlwaysTrigger') return 'every request'
  return rule.kind
}

function actionSummary(action: DfnsPolicySummary['action']): string {
  if (action.kind === 'RequestApproval') {
    const g = action.approvalGroups?.[0]
    const count = g?.approvers?.userId?.in?.length
    if (typeof g?.quorum === 'number' && typeof count === 'number') {
      return `needs ${g.quorum} of ${count} to approve`
    }
    if (typeof g?.quorum === 'number') return `needs ${g.quorum} to approve`
    return 'needs an approver'
  }
  if (action.kind === 'NoAction') return 'clears with no approval'
  if (action.kind === 'Block') return 'blocks the request'
  return action.kind
}

export default function PoliciesPanel() {
  const policies = useDfnsPolicies()
  const hasRelay = useHasActiveRelay()

  if (!hasRelay) {
    return (
      <NotConfigured title="Signing policies" needs="a DFNS organization">
        The rules DFNS checks before a custody key is allowed to sign. This build has no relay to
        read them from.
      </NotConfigured>
    )
  }

  const items = policies.data?.items ?? []
  const active = items.filter((p) => p.status === LIVE)
  const retired = items.filter((p) => p.status !== LIVE)

  return (
    <Card>
      <CardHead
        title={
          <>
            Signing policies <InfoTip term="policy" label="a signing policy" />
          </>
        }
        note="Rules checked before a key is allowed to sign. Only active rules can hold a payment back for someone to approve."
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
        <Empty>No rules set on this custody account.</Empty>
      ) : (
        <div className="space-y-3">
          {active.length === 0 ? (
            <p className="text-xs text-warn">
              No active rule, so nothing is being held back for approval right now. That is a
              setting on the custody account, not a fault.
            </p>
          ) : (
            <ul className="space-y-2">
              {active.map((p) => {
                const approvers = p.action.approvalGroups?.[0]?.approvers?.userId?.in ?? []
                return (
                  <li key={p.id} className="rounded-2xl bg-primary/5 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <span className="text-xs font-medium text-text">{p.name}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-green/15 text-green">
                        active
                      </span>
                    </div>
                    <div className="text-[11px] text-text-secondary mt-1">
                      {ruleSummary(p.rule)} then {actionSummary(p.action)}
                    </div>
                    <div className="text-[10px] text-text-muted mt-1">on {p.activityKind}</div>
                    {approvers.length > 0 && (
                      <div className="text-[10px] text-text-muted mt-0.5">
                        approvers: <span className="font-mono break-all">{approvers.join(', ')}</span>
                      </div>
                    )}
                  </li>
                )
              })}
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

          <p className="text-[10px] text-text-muted">
            These rules live in your DFNS console. The dashboard reads them, it does not change them.
          </p>
        </div>
      )}
    </Card>
  )
}
