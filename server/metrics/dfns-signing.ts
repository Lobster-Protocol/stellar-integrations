import { dfnsApprovals } from './registry'
import { getDfnsClient } from '../dfns/client'

const STATUSES = ['Pending', 'Approved', 'Denied', 'Expired'] as const

// Read-only. Lists approvals per status and sets the gauge, using the same
// policies.listApprovals call the approval routes already run against the live org,
// so it inherits their proven shape. The 100 page cap matches that call; if a status
// ever exceeds it the count is a floor and logs, rather than paginating an unbounded
// set. A dedicated read-only DFNS credential is the production hardening (this only
// ever calls a GET).
export async function refreshDfnsApprovalMetrics(
  client: Pick<ReturnType<typeof getDfnsClient>, 'policies'> = getDfnsClient(),
): Promise<void> {
  for (const status of STATUSES) {
    const res = await client.policies.listApprovals({ query: { status, limit: '100' } })
    const items = res.items ?? []
    if (items.length >= 100) {
      console.warn(`[metrics] ${status} approvals hit the 100 page cap; count is a floor`)
    }
    dfnsApprovals.set({ status: status.toLowerCase() }, items.length)
  }
}

// Refreshes on a slow loop. Off unless the caller starts it (index.ts gates it on
// METRICS_TOKEN + DFNS creds). Each tick swallows its own error so a transient DFNS
// read can never crash the relay, and the timer is unref'd so it does not hold the
// process open.
export function startDfnsMetricsLoop(intervalMs = 60_000): NodeJS.Timeout {
  const tick = () =>
    refreshDfnsApprovalMetrics().catch((err) =>
      console.error('[metrics] dfns approval refresh failed', err),
    )
  void tick()
  const timer = setInterval(tick, intervalMs)
  timer.unref()
  return timer
}
