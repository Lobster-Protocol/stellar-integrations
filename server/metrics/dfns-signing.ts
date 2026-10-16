import { Networks, TransactionBuilder } from '@stellar/stellar-sdk'
import { dfnsApprovals, dfnsApprovalsReadAt } from './registry'
import { getDfnsClient } from '../dfns/client'

type Client = Pick<ReturnType<typeof getDfnsClient>, 'policies'>
type Status = 'Pending' | 'Approved' | 'Denied' | 'Expired'

// pending is what someone has to act on, so it is read on every pass; the totals
// only say how the flow went and are read every quarter of an hour. dfns rate
// limits the whole org, and these reads share that budget with signing.
const TOTALS: Status[] = ['Approved', 'Denied', 'Expired']
const TOTALS_EVERY_MS = 15 * 60_000
let totalsReadAt = Number.NEGATIVE_INFINITY

interface HeldRequest {
  activity?: { transactionRequest?: { network?: string; requestBody?: { transaction?: string } } }
}

// a held stellar transaction whose time bounds have run out can no longer land,
// so approving it does nothing. it is counted apart from the ones still waiting.
export function heldPastItsBounds(approval: HeldRequest, nowMs: number): boolean {
  const request = approval.activity?.transactionRequest
  const raw = request?.requestBody?.transaction
  if (!raw) return false
  try {
    const envelope = raw.startsWith('0x') ? Buffer.from(raw.slice(2), 'hex').toString('base64') : raw
    const passphrase = request?.network === 'Stellar' ? Networks.PUBLIC : Networks.TESTNET
    const tx = TransactionBuilder.fromXDR(envelope, passphrase)
    // a fee bump carries no bounds of its own, its inner transaction does
    const bounded = 'innerTransaction' in tx ? tx.innerTransaction : tx
    const maxTime = Number(bounded.timeBounds?.maxTime ?? 0)
    return maxTime > 0 && maxTime * 1000 < nowMs
  } catch {
    return false
  }
}

// one page of 100 is plenty here; past that the count is a floor
async function listByStatus(client: Client, status: Status) {
  const res = await client.policies.listApprovals({ query: { status, limit: '100' } })
  const items = res.items ?? []
  if (items.length >= 100) {
    console.warn(`[metrics] ${status} approvals hit the 100 page cap; count is a floor`)
  }
  return items
}

// read-only
export async function refreshDfnsApprovalMetrics(client: Client = getDfnsClient(), nowMs = Date.now()): Promise<void> {
  const pending = await listByStatus(client, 'Pending')
  const pastBounds = pending.filter((a) => heldPastItsBounds(a as HeldRequest, nowMs)).length
  dfnsApprovals.set({ status: 'pending' }, pending.length - pastBounds)
  dfnsApprovals.set({ status: 'pending_expired' }, pastBounds)
  if (nowMs - totalsReadAt >= TOTALS_EVERY_MS) {
    for (const status of TOTALS) {
      dfnsApprovals.set({ status: status.toLowerCase() }, (await listByStatus(client, status)).length)
    }
    totalsReadAt = nowMs
  }
  dfnsApprovalsReadAt.set(nowMs / 1000)
}

// unref'd so the timer never holds the process open.
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
