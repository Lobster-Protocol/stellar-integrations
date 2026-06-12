// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { createPolicyMock, listPoliciesMock, archivePolicyMock } = vi.hoisted(() => ({
  createPolicyMock: vi.fn(),
  listPoliciesMock: vi.fn(),
  archivePolicyMock: vi.fn(),
}))

vi.mock('../dfns/client', () => ({
  getDfnsClient: () => ({
    policies: {
      createPolicy: createPolicyMock,
      listPolicies: listPoliciesMock,
      archivePolicy: archivePolicyMock,
    },
  }),
}))

import {
  createTreasuryAmountPolicy,
  createAutoApproveAmountPolicy,
  createRecipientWhitelistPolicy,
  listPolicies,
  archivePolicy,
} from '../dfns/policies'

beforeEach(() => {
  createPolicyMock.mockReset().mockResolvedValue({ id: 'pol-1' })
  listPoliciesMock.mockReset().mockResolvedValue({ items: [] })
  archivePolicyMock.mockReset().mockResolvedValue({ id: 'pol-1', status: 'Archived' })
})

afterEach(() => {
  delete process.env.DFNS_POLICY_AMOUNT_LIMIT_USD
  delete process.env.DFNS_POLICY_AUTO_APPROVE_LIMIT_USD
})

describe('createTreasuryAmountPolicy', () => {
  it('falls back to 50_000 USD when DFNS_POLICY_AMOUNT_LIMIT_USD is unset', async () => {
    await createTreasuryAmountPolicy({ approverUserIds: ['u1', 'u2'], quorum: 2, autoRejectTimeoutMin: 60 })
    const body = createPolicyMock.mock.calls[0][0].body as Record<string, unknown>
    const rule = body.rule as { configuration: { limit: number; currency: string } }
    expect(rule.configuration.limit).toBe(50_000)
    expect(rule.configuration.currency).toBe('USD')
  })

  it('reads DFNS_POLICY_AMOUNT_LIMIT_USD when set', async () => {
    process.env.DFNS_POLICY_AMOUNT_LIMIT_USD = '25000'
    await createTreasuryAmountPolicy({ approverUserIds: ['u1'], quorum: 1, autoRejectTimeoutMin: 60 })
    const body = createPolicyMock.mock.calls[0][0].body as Record<string, unknown>
    const rule = body.rule as { configuration: { limit: number } }
    expect(rule.configuration.limit).toBe(25_000)
  })

  it('passes approver userIds verbatim into the approvalGroups', async () => {
    await createTreasuryAmountPolicy({
      approverUserIds: ['us-aaa', 'us-bbb', 'us-ccc'],
      quorum: 2,
      autoRejectTimeoutMin: 10_080,
    })
    const body = createPolicyMock.mock.calls[0][0].body as {
      action: {
        approvalGroups: Array<{ approvers: { userId: { in: string[] } }; quorum: number }>
      }
    }
    expect(body.action.approvalGroups[0].approvers.userId.in).toEqual(['us-aaa', 'us-bbb', 'us-ccc'])
    expect(body.action.approvalGroups[0].quorum).toBe(2)
  })
})

describe('createAutoApproveAmountPolicy', () => {
  it('falls back to 100 USD when env is unset and no arg', async () => {
    await createAutoApproveAmountPolicy()
    const body = createPolicyMock.mock.calls[0][0].body as Record<string, unknown>
    const rule = body.rule as { configuration: { limit: number } }
    expect(rule.configuration.limit).toBe(100)
  })

  it('takes the explicit limitUsd arg over env', async () => {
    process.env.DFNS_POLICY_AUTO_APPROVE_LIMIT_USD = '500'
    await createAutoApproveAmountPolicy(250)
    const body = createPolicyMock.mock.calls[0][0].body as Record<string, unknown>
    const rule = body.rule as { configuration: { limit: number } }
    expect(rule.configuration.limit).toBe(250)
  })

  it('uses action kind NoAction (auto approve)', async () => {
    await createAutoApproveAmountPolicy(10)
    const body = createPolicyMock.mock.calls[0][0].body as { action: { kind: string } }
    expect(body.action.kind).toBe('NoAction')
  })
})

describe('createRecipientWhitelistPolicy', () => {
  it('passes the allowed addresses verbatim into the configuration', async () => {
    const allowed = [
      'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU',
      'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    ]
    await createRecipientWhitelistPolicy(allowed)
    const body = createPolicyMock.mock.calls[0][0].body as {
      rule: { kind: string; configuration: { addresses: string[] } }
      action: { kind: string }
    }
    expect(body.rule.kind).toBe('TransactionRecipientWhitelist')
    expect(body.rule.configuration.addresses).toEqual(allowed)
    expect(body.action.kind).toBe('Block')
  })
})

describe('listPolicies / archivePolicy', () => {
  it('forwards the underlying calls without modification', async () => {
    await listPolicies()
    expect(listPoliciesMock).toHaveBeenCalledWith({ query: { limit: '100' } })

    await archivePolicy('pol-42')
    expect(archivePolicyMock).toHaveBeenCalledWith({ policyId: 'pol-42' })
  })
})
