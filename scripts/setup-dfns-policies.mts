// One-time setup for the DFNS approval policies the treasury wallet runs
// under. An operator runs this once per environment; the relay itself never
// creates policies at runtime.
//
//   tsx scripts/setup-dfns-policies.mts
//   tsx scripts/setup-dfns-policies.mts --reset   archive existing first
//
// Approvers and thresholds come from env so the same script works for
// sandbox and production without edits:
//   DFNS_APPROVER_USER_IDS   comma-separated DFNS userIds (the humans who sign off)
//   DFNS_APPROVAL_QUORUM     how many of them must approve (default 2)
//   DFNS_POLICY_AUTO_APPROVE_LIMIT_USD   below this, sign without a human
//   DFNS_RECIPIENT_WHITELIST comma-separated G-addresses payments may target

import {
  createAutoApproveAmountPolicy,
  createTreasuryAmountPolicy,
  createRecipientWhitelistPolicy,
  listPolicies,
  archivePolicy,
} from '../server/dfns/policies'

const approvers = (process.env.DFNS_APPROVER_USER_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

if (approvers.length === 0) {
  console.error('set DFNS_APPROVER_USER_IDS to at least one DFNS userId before running')
  process.exit(1)
}

const quorum = Math.min(Number(process.env.DFNS_APPROVAL_QUORUM ?? '2'), approvers.length)
const whitelist = (process.env.DFNS_RECIPIENT_WHITELIST ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

if (process.argv.includes('--reset')) {
  const existing = await listPolicies()
  for (const p of (existing.items ?? []) as Array<{ id: string; status?: string }>) {
    if (p.status === 'Active') {
      await archivePolicy(p.id)
      console.log(`archived ${p.id}`)
    }
  }
}

const autoApprove = await createAutoApproveAmountPolicy()
console.log(`auto-approve below threshold: ${autoApprove.id}`)

const aboveThreshold = await createTreasuryAmountPolicy({
  approverUserIds: approvers,
  quorum,
  autoRejectTimeoutMin: 7 * 24 * 60,
})
console.log(`approval above threshold (quorum ${quorum}): ${aboveThreshold.id}`)

if (whitelist.length > 0) {
  const recipients = await createRecipientWhitelistPolicy(whitelist)
  console.log(`recipient whitelist (${whitelist.length} addresses): ${recipients.id}`)
} else {
  console.log('no DFNS_RECIPIENT_WHITELIST set, skipping the whitelist policy')
}
