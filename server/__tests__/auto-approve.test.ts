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

import { autoApproveArmed, isOwnHeldRequest, autoApproveHeldForWallet } from '../dfns/auto-approve'

// the activity shape DFNS returns for a held sign request
const held = (walletId: string, txId: string, kind = 'Wallets:Sign') => ({
  kind,
  transactionRequest: { id: txId, walletId, requestBody: { kind: 'Transaction' } },
})

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

describe('isOwnHeldRequest', () => {
  it('matches the sign request we just sent, on our wallet', () => {
    expect(isOwnHeldRequest(held('wa-1', 'tx-1'), 'wa-1', 'tx-1')).toBe(true)
  })
  it('does not match another request held on the same wallet', () => {
    expect(isOwnHeldRequest(held('wa-1', 'tx-console'), 'wa-1', 'tx-1')).toBe(false)
  })
  it('does not match a different wallet', () => {
    expect(isOwnHeldRequest(held('wa-2', 'tx-1'), 'wa-1', 'tx-1')).toBe(false)
  })
  it('does not match an activity that is not a sign request', () => {
    expect(isOwnHeldRequest(held('wa-1', 'tx-1', 'Wallets:TransferAsset'), 'wa-1', 'tx-1')).toBe(false)
  })
  it('does not match with no activity, no wallet id or no transaction id', () => {
    expect(isOwnHeldRequest(undefined, 'wa-1', 'tx-1')).toBe(false)
    expect(isOwnHeldRequest(held('wa-1', 'tx-1'), '', 'tx-1')).toBe(false)
    expect(isOwnHeldRequest(held('wa-1', 'tx-1'), 'wa-1', '')).toBe(false)
  })
})

describe('autoApproveHeldForWallet', () => {
  it('does nothing when not armed: no list, no vote', async () => {
    const n = await autoApproveHeldForWallet('wa-1', 'tx-1')
    expect(n).toBe(0)
    expect(listSpy).not.toHaveBeenCalled()
    expect(decideSpy).not.toHaveBeenCalled()
  })

  it('approves the hold on the request we just sent', async () => {
    arm()
    listSpy.mockResolvedValueOnce({
      items: [{ id: 'ap-1', status: 'Pending', activity: held('wa-1', 'tx-1') }],
    })
    const n = await autoApproveHeldForWallet('wa-1', 'tx-1')
    expect(n).toBe(1)
    expect(decideSpy).toHaveBeenCalledWith({
      approvalId: 'ap-1',
      body: { value: 'Approved', reason: expect.any(String) },
    })
  })

  it('leaves every other hold on the wallet for a human', async () => {
    arm()
    listSpy.mockResolvedValueOnce({
      items: [
        { id: 'ap-1', status: 'Pending', activity: held('wa-1', 'tx-1') },
        { id: 'ap-2', status: 'Pending', activity: held('wa-1', 'tx-console') },
        { id: 'ap-3', status: 'Pending', activity: held('wa-OTHER', 'tx-9') },
      ],
    })
    const n = await autoApproveHeldForWallet('wa-1', 'tx-1')
    expect(n).toBe(1)
    expect(decideSpy).toHaveBeenCalledTimes(1)
    expect(decideSpy).toHaveBeenCalledWith(expect.objectContaining({ approvalId: 'ap-1' }))
  })
})
