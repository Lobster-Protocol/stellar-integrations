import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock the approver identity + the approval listing so we exercise arming and
// scoping without touching dfns. approverConfigured reads a test-only env hook.
const { listSpy, decideSpy } = vi.hoisted(() => ({
  listSpy: vi.fn(),
  decideSpy: vi.fn(async () => ({ id: 'ap-x' })),
}))
vi.mock('../dfns/approvals', () => ({ listPendingApprovals: listSpy }))
vi.mock('../dfns/approver', () => ({
  approverConfigured: () => process.env.__APPROVER_CONFIGURED === '1',
  getApproverClient: () => ({ policies: { createApprovalDecision: decideSpy } }),
}))

import { autoApproveArmed, activityMentionsWallet, autoApproveHeldForWallet } from '../dfns/auto-approve'

beforeEach(() => {
  listSpy.mockReset().mockResolvedValue({ items: [] })
  decideSpy.mockClear()
  delete process.env.DFNS_AUTO_APPROVE_TESTNET
  delete process.env.DFNS_STELLAR_NETWORK
  delete process.env.__APPROVER_CONFIGURED
})

function arm() {
  process.env.DFNS_AUTO_APPROVE_TESTNET = '1'
  process.env.DFNS_STELLAR_NETWORK = 'StellarTestnet'
  process.env.__APPROVER_CONFIGURED = '1'
}

describe('autoApproveArmed (fail-closed)', () => {
  it('is off by default, even with an approver configured', () => {
    process.env.__APPROVER_CONFIGURED = '1'
    expect(autoApproveArmed()).toBe(false)
  })

  it('is off on mainnet even when the flag is set (the load-bearing guard)', () => {
    arm()
    process.env.DFNS_STELLAR_NETWORK = 'Stellar'
    expect(autoApproveArmed()).toBe(false)
  })

  it('is off when no approver identity is configured', () => {
    process.env.DFNS_AUTO_APPROVE_TESTNET = '1'
    process.env.DFNS_STELLAR_NETWORK = 'StellarTestnet'
    expect(autoApproveArmed()).toBe(false)
  })

  it('is on only when armed AND testnet AND approver configured', () => {
    arm()
    expect(autoApproveArmed()).toBe(true)
  })
})

describe('activityMentionsWallet (scoping, fail-closed)', () => {
  it('matches when the activity json carries our wallet id', () => {
    expect(activityMentionsWallet({ transferRequest: { walletId: 'wa-1' } }, 'wa-1')).toBe(true)
  })
  it('does not match a different wallet', () => {
    expect(activityMentionsWallet({ transferRequest: { walletId: 'wa-2' } }, 'wa-1')).toBe(false)
  })
  it('does not match empty activity or empty wallet id', () => {
    expect(activityMentionsWallet(undefined, 'wa-1')).toBe(false)
    expect(activityMentionsWallet({ transferRequest: { walletId: 'wa-1' } }, '')).toBe(false)
  })
})

describe('autoApproveHeldForWallet', () => {
  it('does nothing when not armed: no list, no vote', async () => {
    const n = await autoApproveHeldForWallet('wa-1')
    expect(n).toBe(0)
    expect(listSpy).not.toHaveBeenCalled()
    expect(decideSpy).not.toHaveBeenCalled()
  })

  it('approves a held approval that targets our wallet', async () => {
    arm()
    listSpy.mockResolvedValueOnce({
      items: [{ id: 'ap-1', status: 'Pending', activity: { transferRequest: { walletId: 'wa-1' } } }],
    })
    const n = await autoApproveHeldForWallet('wa-1')
    expect(n).toBe(1)
    expect(decideSpy).toHaveBeenCalledWith({
      approvalId: 'ap-1',
      body: { value: 'Approved', reason: expect.any(String) },
    })
  })

  it('skips an approval that does not target our wallet (fail-closed)', async () => {
    arm()
    listSpy.mockResolvedValueOnce({
      items: [{ id: 'ap-2', status: 'Pending', activity: { transferRequest: { walletId: 'wa-OTHER' } } }],
    })
    const n = await autoApproveHeldForWallet('wa-1')
    expect(n).toBe(0)
    expect(decideSpy).not.toHaveBeenCalled()
  })
})
