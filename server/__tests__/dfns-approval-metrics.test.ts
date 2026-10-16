// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { Account, Keypair, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk'

import { heldPastItsBounds, refreshDfnsApprovalMetrics } from '../metrics/dfns-signing'
import { registry } from '../metrics/registry'

async function value(name: string, status?: string): Promise<number | undefined> {
  const metric = await registry.getSingleMetric(name)?.get()
  return metric?.values.find((v) => !status || v.labels.status === status)?.value
}

// the way dfns hands a held stellar transaction back: hex of the envelope, 0x first
function heldTx(maxTimeSeconds: number, network: 'Stellar' | 'StellarTestnet' = 'Stellar') {
  const tx = new TransactionBuilder(new Account(Keypair.random().publicKey(), '1'), {
    fee: '100',
    networkPassphrase: network === 'Stellar' ? Networks.PUBLIC : Networks.TESTNET,
  })
    .addOperation(Operation.bumpSequence({ bumpTo: '2' }))
    .setTimebounds(0, maxTimeSeconds)
    .build()
  const hex = Buffer.from(tx.toXDR(), 'base64').toString('hex')
  return { activity: { transactionRequest: { network, requestBody: { kind: 'Transaction', transaction: `0x${hex}` } } } }
}

function client(pending: unknown[] = []) {
  const listApprovals = vi.fn(async ({ query }: { query: { status: string } }) => ({
    items: query.status === 'Pending' ? pending : [],
  }))
  return { policies: { listApprovals }, listApprovals }
}

const MIN = 60_000
// far apart from one test to the next, so each starts past the totals interval
let now = 2_000_000_000_000
const later = (ms: number) => (now += ms)

describe('refreshDfnsApprovalMetrics', () => {
  it('counts approvals by status and stamps the read', async () => {
    const c = client([{ id: 'ap-1' }, { id: 'ap-2' }])
    const at = later(60 * MIN)
    await refreshDfnsApprovalMetrics(c as never, at)
    expect(await value('lobster_dfns_approvals', 'pending')).toBe(2)
    expect(await value('lobster_dfns_approvals', 'approved')).toBe(0)
    expect(await value('lobster_dfns_approvals_read_timestamp_seconds')).toBe(at / 1000)
  })

  it('counts a held transaction past its time bounds apart from the ones that can still land', async () => {
    const at = later(60 * MIN)
    const c = client([heldTx(at / 1000 - 60), heldTx(at / 1000 + 600), { id: 'transfer-request' }])
    await refreshDfnsApprovalMetrics(c as never, at)
    expect(await value('lobster_dfns_approvals', 'pending')).toBe(2)
    expect(await value('lobster_dfns_approvals', 'pending_expired')).toBe(1)
  })

  it('reads pending every pass and the totals once a quarter of an hour', async () => {
    const c = client()
    await refreshDfnsApprovalMetrics(c as never, later(60 * MIN))
    expect(c.listApprovals).toHaveBeenCalledTimes(4)
    await refreshDfnsApprovalMetrics(c as never, later(MIN))
    expect(c.listApprovals).toHaveBeenCalledTimes(5)
    await refreshDfnsApprovalMetrics(c as never, later(15 * MIN))
    expect(c.listApprovals).toHaveBeenCalledTimes(9)
  })

  it('leaves the stamp where it was when a read fails, so the gap shows', async () => {
    await refreshDfnsApprovalMetrics(client([{ id: 'ap-1' }]) as never, later(60 * MIN))
    const stamped = await value('lobster_dfns_approvals_read_timestamp_seconds')
    const failing = { policies: { listApprovals: async () => { throw new Error('dfns down') } } }
    await expect(refreshDfnsApprovalMetrics(failing as never, later(MIN))).rejects.toThrow('dfns down')
    expect(await value('lobster_dfns_approvals_read_timestamp_seconds')).toBe(stamped)
    expect(await value('lobster_dfns_approvals', 'pending')).toBe(1)
  })
})

describe('heldPastItsBounds', () => {
  const at = 1_800_000_000_000

  it('reads the time bounds on either network', () => {
    expect(heldPastItsBounds(heldTx(at / 1000 - 1), at)).toBe(true)
    expect(heldPastItsBounds(heldTx(at / 1000 - 1, 'StellarTestnet'), at)).toBe(true)
    expect(heldPastItsBounds(heldTx(at / 1000 + 1), at)).toBe(false)
  })

  it('leaves a request it cannot read, or one with no upper bound, as waiting', () => {
    expect(heldPastItsBounds({}, at)).toBe(false)
    expect(heldPastItsBounds({ activity: { transactionRequest: { network: 'Stellar', requestBody: { transaction: '0xzz' } } } }, at)).toBe(false)
    expect(heldPastItsBounds(heldTx(0), at)).toBe(false)
  })
})
