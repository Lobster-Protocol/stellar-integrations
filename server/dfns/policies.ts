import { getDfnsClient } from './client'

// per-policy thresholds sit in env so they can change without a redeploy.
function num(name: string, fallback: number): number {
  const v = process.env[name]
  if (!v) return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

// scoped by wallet id, not tag: no wallet in the org carries a tag, and an id list
// shows in the console exactly which wallets a rule covers.
function onWallets(walletIds: string[]) {
  if (walletIds.length === 0) {
    throw new Error('a policy needs at least one wallet id, or it covers nothing')
  }
  return { walletId: { in: walletIds } }
}

export interface PolicyParams {
  walletIds: string[]
  approverUserIds: string[]
  quorum: number
  // minutes the request stays open before auto-reject
  autoRejectTimeoutMin: number
  limitUsd?: number
  name?: string
}

export async function createTreasuryAmountPolicy(p: PolicyParams) {
  const dfns = getDfnsClient()
  const limit = p.limitUsd ?? num('DFNS_POLICY_AMOUNT_LIMIT_USD', 50_000)
  return dfns.policies.createPolicy({
    body: {
      name: p.name ?? `treasury amount limit ${limit} usd`,
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
      filters: onWallets(p.walletIds),
    },
  })
}

// the other half of createTreasuryAmountPolicy: under the threshold a signature
// clears without a human.
export async function createAutoApproveAmountPolicy(walletIds: string[], limitUsd?: number) {
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
      filters: onWallets(walletIds),
    },
  })
}

export async function createRecipientWhitelistPolicy(walletIds: string[], allowed: string[]) {
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
      filters: onWallets(walletIds),
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
