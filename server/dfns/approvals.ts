import { getDfnsClient } from './client'

export type ApprovalDecision = 'Approved' | 'Denied'

export async function listPendingApprovals() {
  const dfns = getDfnsClient()
  return dfns.policies.listApprovals({ query: { status: 'Pending', limit: '100' } })
}

export async function decideApproval(approvalId: string, value: ApprovalDecision, reason?: string) {
  const dfns = getDfnsClient()
  return dfns.policies.createApprovalDecision({
    approvalId,
    body: { value, reason },
  })
}
