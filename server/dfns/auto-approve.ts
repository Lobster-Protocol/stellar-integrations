import { listPendingApprovals } from './approvals'
import { approverConfigured, getApproverClient } from './approver'

// On testnet the relay approves its own treasury signatures when a policy holds
// them, so the custody flow runs pending -> approved -> executed with nobody in
// the DFNS console. It votes as a separate approver user (approver.ts), because a
// service account can't vote by default.

// Armed only when explicitly turned on AND on testnet AND an approver identity is
// present. Mainnet is DFNS_STELLAR_NETWORK === 'Stellar'; anything else is testnet.
// Auto-approving on mainnet would defeat the entire point of the custody hold, so
// it is refused there whatever the flag says. Off by default.
export function autoApproveArmed(): boolean {
  if (process.env.DFNS_AUTO_APPROVE_TESTNET !== '1') return false
  if (process.env.DFNS_STELLAR_NETWORK === 'Stellar') return false
  return approverConfigured()
}

// Our walletId is a unique wa-... handle, so testing the approval's activity json
// for it attributes the hold to our treasury without parsing DFNS's deep activity
// union. An approval we cannot attribute to our wallet is skipped, never approved.
export function activityMentionsWallet(activity: unknown, walletId: string): boolean {
  if (!walletId) return false
  try {
    return JSON.stringify(activity ?? {}).includes(walletId)
  } catch {
    return false
  }
}

type PendingApproval = { id: string; status?: string; activity?: unknown }

// Approve every approval held for our treasury wallet, voting as the approver User.
// Lists with the service account (reading approvals is allowed) but decides with
// the approver User, the only identity permitted to vote without the staff flag.
// Returns how many it approved. The caller keeps this off the throwing path so a
// failed vote leaves the tx pending for a human rather than breaking the sign.
export async function autoApproveHeldForWallet(walletId: string): Promise<number> {
  if (!autoApproveArmed()) return 0
  const res = await listPendingApprovals()
  const items = (res.items ?? []) as PendingApproval[]
  const dfns = getApproverClient()
  let approved = 0
  for (const ap of items) {
    if (ap.status && ap.status !== 'Pending') continue
    if (!activityMentionsWallet(ap.activity, walletId)) continue
    await dfns.policies.createApprovalDecision({
      approvalId: ap.id,
      body: { value: 'Approved', reason: 'auto-approved by the Lobster testnet demo relay' },
    })
    approved++
  }
  return approved
}
