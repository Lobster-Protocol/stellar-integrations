// One-time setup for the DFNS approval policies the treasury wallets run
// under. An operator runs this per environment; the relay itself never creates
// policies at runtime.
//
//   tsx scripts/setup-dfns-policies.mts --dry-run   print the plan, change nothing
//   tsx scripts/setup-dfns-policies.mts             create the policies
//   tsx scripts/setup-dfns-policies.mts --reset     archive the active ones first
//
// It writes two thresholds, not one, because a single always-on rule hides half
// of what custody does. The demo wallet gets a pair: below the threshold a
// signature clears on its own, above it a named approver has to release it, and
// both rules show up in the console and on the Audit page. Every other wallet
// keeps the strict rule where anything at all needs an approver.
//
// Env:
//   DFNS_APPROVER_USER_IDS   comma-separated DFNS userIds who sign off
//   DFNS_APPROVAL_QUORUM     how many of them must approve (default 1)
//   DFNS_DEMO_WALLET_ID      wallet that gets the two-threshold pair
//   DFNS_POLICY_DEMO_LIMIT_USD    threshold for that pair (default 5)
//   DFNS_POLICY_STRICT_LIMIT_USD  threshold for every other wallet (default 0.0001)
//   DFNS_RECIPIENT_WHITELIST comma-separated G-addresses payments may target

import { getDfnsClient } from '../server/dfns/client'
import {
  createAutoApproveAmountPolicy,
  createTreasuryAmountPolicy,
  createRecipientWhitelistPolicy,
  listPolicies,
  archivePolicy,
} from '../server/dfns/policies'

const dryRun = process.argv.includes('--dry-run')
const reset = process.argv.includes('--reset')

const approvers = (process.env.DFNS_APPROVER_USER_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

if (approvers.length === 0) {
  console.error('set DFNS_APPROVER_USER_IDS to at least one DFNS userId before running')
  process.exit(1)
}

const demoWalletId = process.env.DFNS_DEMO_WALLET_ID
if (!demoWalletId) {
  console.error('set DFNS_DEMO_WALLET_ID to the wallet that gets the two-threshold pair')
  process.exit(1)
}

const quorum = Math.min(Number(process.env.DFNS_APPROVAL_QUORUM ?? '1'), approvers.length)
const demoLimit = Number(process.env.DFNS_POLICY_DEMO_LIMIT_USD ?? '5')
const strictLimit = Number(process.env.DFNS_POLICY_STRICT_LIMIT_USD ?? '0.0001')
const whitelist = (process.env.DFNS_RECIPIENT_WHITELIST ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

const wallets = await getDfnsClient().wallets.listWallets({ query: { limit: '100' } })
const allIds = ((wallets.items ?? []) as Array<{ id: string }>).map((w) => w.id)
if (!allIds.includes(demoWalletId)) {
  console.error(`DFNS_DEMO_WALLET_ID ${demoWalletId} is not in this org`)
  process.exit(1)
}
const otherIds = allIds.filter((id) => id !== demoWalletId)

console.log(`demo wallet     ${demoWalletId}`)
console.log(`other wallets   ${otherIds.length}`)
console.log(`approvers       ${approvers.join(', ')} (quorum ${quorum})`)
console.log(`demo threshold  ${demoLimit} USD`)
console.log(`strict threshold ${strictLimit} USD`)
console.log('')

const existing = await listPolicies()
const active = ((existing.items ?? []) as Array<{ id: string; name: string; status?: string }>).filter(
  (p) => p.status === 'Active',
)

if (dryRun) {
  console.log('dry run, nothing was changed. it would:')
  for (const p of active) console.log(`  archive  ${p.id}  ${p.name}`)
  console.log(`  create   strict ${strictLimit} usd -> approval, on ${otherIds.length} wallets`)
  console.log(`  create   demo ${demoLimit} usd -> approval, on the demo wallet`)
  console.log(`  create   demo under ${demoLimit} usd -> no action, on the demo wallet`)
  if (whitelist.length > 0) console.log(`  create   recipient whitelist, ${whitelist.length} addresses`)
  process.exit(0)
}

if (reset) {
  for (const p of active) {
    await archivePolicy(p.id)
    console.log(`archived ${p.id}  ${p.name}`)
  }
}

const strict = await createTreasuryAmountPolicy({
  walletIds: otherIds,
  approverUserIds: approvers,
  quorum,
  autoRejectTimeoutMin: 7 * 24 * 60,
  limitUsd: strictLimit,
  name: 'every signature needs an approver',
})
console.log(`strict rule on ${otherIds.length} wallets: ${strict.id}`)

const above = await createTreasuryAmountPolicy({
  walletIds: [demoWalletId],
  approverUserIds: approvers,
  quorum,
  autoRejectTimeoutMin: 7 * 24 * 60,
  limitUsd: demoLimit,
  name: `demo treasury: over ${demoLimit} usd needs an approver`,
})
console.log(`demo approval rule: ${above.id}`)

const under = await createAutoApproveAmountPolicy([demoWalletId], demoLimit)
console.log(`demo auto-approve rule: ${under.id}`)

if (whitelist.length > 0) {
  const recipients = await createRecipientWhitelistPolicy(allIds, whitelist)
  console.log(`recipient whitelist (${whitelist.length} addresses): ${recipients.id}`)
} else {
  console.log('no DFNS_RECIPIENT_WHITELIST set, skipping the whitelist policy')
}
