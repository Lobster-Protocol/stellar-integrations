import { dfnsApprovals } from './registry'
import { getDfnsClient } from '../dfns/client'

const STATUSES = ['Pending', 'Approved', 'Denied', 'Expired'] as const

// read-only: counts approvals per status with the same listApprovals call the
// approval routes use. one page of 100 is plenty here; past that the count is a
// floor and it logs.
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

// refresh every minute. a failed read only logs, and the timer is unref'd so it
// never holds the process open.
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
