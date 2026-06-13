import { useState } from 'react'

import { useDfnsPendingApprovals, useDfnsApprove } from '../integrations/dfns/hooks'

export default function PendingApprovalsPanel() {
  const approvals = useDfnsPendingApprovals()
  const decide = useDfnsApprove()
  const [reason, setReason] = useState<Record<string, string>>({})

  if (!import.meta.env.VITE_LOBSTER_API_URL) {
    return null
  }

  return (
    <div className="rounded-3xl p-5 bg-bg-card card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text">Pending approvals</h3>
        <span className="text-xs text-text-muted">
          {approvals.isLoading ? '...' : `${approvals.data?.items.length ?? 0}`}
        </span>
      </div>

      {approvals.isLoading ? (
        <p className="text-xs text-text-muted">Loading...</p>
      ) : approvals.isError ? (
        <p className="text-xs text-coral">{(approvals.error as Error).message}</p>
      ) : (approvals.data?.items.length ?? 0) === 0 ? (
        <p className="text-xs text-text-muted">No approvals waiting.</p>
      ) : (
        <ul className="space-y-3">
          {approvals.data!.items.map((a) => (
            <li key={a.id} className="rounded-2xl border border-text-muted/15 px-3 py-3">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-mono text-text-secondary truncate">{a.id}</span>
                <span className="text-text-muted">{a.activityKind}</span>
              </div>
              {a.expirationDate && (
                <div className="text-xs text-text-muted mb-2">expires {a.expirationDate}</div>
              )}
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  placeholder="optional reason"
                  value={reason[a.id] ?? ''}
                  onChange={(e) => setReason((m) => ({ ...m, [a.id]: e.target.value }))}
                  className="flex-1 bg-bg rounded-lg px-2 py-1.5 text-xs"
                />
                <button
                  type="button"
                  onClick={() => decide.mutate({ approvalId: a.id, value: 'Approved', reason: reason[a.id] })}
                  disabled={decide.isPending}
                  className="px-3 py-1.5 rounded-full bg-green/15 text-green text-xs font-semibold hover:bg-green/25 disabled:opacity-40"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => decide.mutate({ approvalId: a.id, value: 'Denied', reason: reason[a.id] })}
                  disabled={decide.isPending}
                  className="px-3 py-1.5 rounded-full bg-coral/15 text-coral text-xs font-semibold hover:bg-coral/25 disabled:opacity-40"
                >
                  Deny
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {decide.isError && (
        <p className="text-xs text-coral mt-2">{(decide.error as Error).message}</p>
      )}
    </div>
  )
}
