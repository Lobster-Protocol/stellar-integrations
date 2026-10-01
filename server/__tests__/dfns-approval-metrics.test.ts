// @vitest-environment node
import { describe, it, expect } from 'vitest'

import { refreshDfnsApprovalMetrics } from '../metrics/dfns-signing'
import { registry } from '../metrics/registry'

async function value(name: string, status?: string): Promise<number | undefined> {
  const metric = await registry.getSingleMetric(name)?.get()
  return metric?.values.find((v) => !status || v.labels.status === status)?.value
}

const client = (pending: number) => ({
  policies: {
    listApprovals: async ({ query }: { query: { status: string } }) => ({
      items: Array.from({ length: query.status === 'Pending' ? pending : 0 }, (_, i) => ({ id: `ap-${i}` })),
    }),
  },
})

describe('refreshDfnsApprovalMetrics', () => {
  it('counts approvals by status and stamps the read', async () => {
    const before = Date.now() / 1000
    await refreshDfnsApprovalMetrics(client(2) as never)
    expect(await value('lobster_dfns_approvals', 'pending')).toBe(2)
    expect(await value('lobster_dfns_approvals', 'approved')).toBe(0)
    expect(await value('lobster_dfns_approvals_read_timestamp_seconds')).toBeGreaterThanOrEqual(before)
  })

  it('leaves the stamp where it was when a read fails, so the gap shows', async () => {
    await refreshDfnsApprovalMetrics(client(1) as never)
    const stamped = await value('lobster_dfns_approvals_read_timestamp_seconds')
    const failing = { policies: { listApprovals: async () => { throw new Error('dfns down') } } }
    await expect(refreshDfnsApprovalMetrics(failing as never)).rejects.toThrow('dfns down')
    expect(await value('lobster_dfns_approvals_read_timestamp_seconds')).toBe(stamped)
    expect(await value('lobster_dfns_approvals', 'pending')).toBe(1)
  })
})
