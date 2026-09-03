import { getDfnsClient } from './client'

// per-policy thresholds sit in env so they can change without a redeploy.
function num(name: string, fallback: number): number {
  const v = process.env[name]
  if (!v) return fallback
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

// DFNS scopes a policy either by wallet id or by wallet tag. This used to filter
// on the tag 'treasury', and not one wallet in the org carries a tag, so every
// policy written here matched nothing at all. Ids are the handle that cannot go
// quiet like that: the scope is enumerated, and the console shows exactly which
// wallets a rule covers.
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
  // minutes the request stays open before auto-reject. 7 days by default.
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

// auto-approve under a usd threshold. paired with createTreasuryAmountPolicy
// for amounts above it: small sums clear without a human, the bigger ones
// route through an approver quorum.
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

// The amount rules cannot be made to work on Stellar testnet: DFNS answers
// "Could not get USD market price for the asset" for testXLM, and separately
// refuses to read an amount off a raw XDR request at all ("only supported on a
// transfer request"). Both make an amount rule fail closed, so it holds every
// signature and there is no branch left that clears on its own. A recipient rule
// reads the destination address, which DFNS always has. Paying an address we
// listed clears; paying anywhere else waits for an approver.
export async function createRecipientApprovalPolicy(p: {
  walletIds: string[]
  allowed: string[]
  approverUserIds: string[]
  quorum: number
  autoRejectTimeoutMin: number
  name?: string
}) {
  const dfns = getDfnsClient()
  return dfns.policies.createPolicy({
    body: {
      name: p.name ?? 'payments off our own addresses need an approver',
      activityKind: 'Wallets:Sign',
      rule: {
        kind: 'TransactionRecipientWhitelist',
        configuration: { addresses: p.allowed },
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
