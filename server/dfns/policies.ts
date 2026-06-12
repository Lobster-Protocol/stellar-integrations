import { getDfnsClient } from './client'

// per-policy seuils sit in env so they can change without redeploy.
// values are USD-equivalents at policy-create time per MiCA Article 68.
function num(name: string, fallback: number): number {
  const v = process.env[name]
  if (!v) return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export interface PolicyParams {
  approverUserIds: string[]
  quorum: number
  // minutes the request stays open before auto-reject. 7 days by default.
  autoRejectTimeoutMin: number
}

export async function createTreasuryAmountPolicy(p: PolicyParams) {
  const dfns = getDfnsClient()
  const limit = num('DFNS_POLICY_AMOUNT_LIMIT_USD', 50_000)
  return dfns.policies.createPolicy({
    body: {
      name: `treasury amount limit ${limit} usd`,
      activityKind: 'Wallets:Sign',
      rule: {
        kind: 'TransactionAmountLimit',
        configuration: { limit, currency: 'USD' },
      },
      action: {
        kind: 'RequestApproval',
        autoRejectTimeout: p.autoRejectTimeoutMin,
        approvalGroups: [
          {
            name: 'compliance',
            quorum: p.quorum,
            approvers: { userId: { in: p.approverUserIds } },
          },
        ],
      },
      filters: { walletTags: { hasAny: ['treasury'] } },
    },
  })
}

// auto-approve under a usd threshold. paired with createTreasuryAmountPolicy
// for amounts above it: small sums clear without a human, the bigger ones
// route through an approver quorum.
export async function createAutoApproveAmountPolicy(limitUsd?: number) {
  const dfns = getDfnsClient()
  const limit = limitUsd ?? num('DFNS_POLICY_AUTO_APPROVE_LIMIT_USD', 100)
  return dfns.policies.createPolicy({
    body: {
      name: `treasury auto-approve under ${limit} usd`,
      activityKind: 'Wallets:Sign',
      rule: {
        kind: 'TransactionAmountLimit',
        configuration: { limit, currency: 'USD' },
      },
      action: { kind: 'NoAction' },
      filters: { walletTags: { hasAny: ['treasury'] } },
    },
  })
}

export async function createRecipientWhitelistPolicy(allowed: string[]) {
  const dfns = getDfnsClient()
  return dfns.policies.createPolicy({
    body: {
      name: 'treasury recipient whitelist',
      activityKind: 'Wallets:Sign',
      rule: {
        kind: 'TransactionRecipientWhitelist',
        configuration: { addresses: allowed },
      },
      action: { kind: 'Block' },
      filters: { walletTags: { hasAny: ['treasury'] } },
    },
  })
}

export async function listPolicies() {
  const dfns = getDfnsClient()
  return dfns.policies.listPolicies({ query: { limit: '100' } })
}

export async function archivePolicy(policyId: string) {
  const dfns = getDfnsClient()
  return dfns.policies.archivePolicy({ policyId })
}
