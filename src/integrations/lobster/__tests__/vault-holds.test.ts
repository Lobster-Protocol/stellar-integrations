import { describe, it, expect, vi, beforeEach } from 'vitest'

const { simulateRead } = vi.hoisted(() => ({ simulateRead: vi.fn() }))
vi.mock('../../stellar/read', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../stellar/read')>()),
  simulateRead,
}))

import { vaultHolds } from '../position'

// fakes get_active_protocol and get_amounts_tokens, by method name
function reads(protocol: number, amounts: [bigint, bigint]) {
  simulateRead.mockImplementation(async (_n, _s, _c, method: string) =>
    method === 'get_active_protocol' ? BigInt(protocol) : amounts,
  )
}

describe('vaultHolds', () => {
  beforeEach(() => {
    simulateRead.mockReset()
  })

  it('says yes for a vault in a pool, even with nothing idle', async () => {
    reads(0, [0n, 0n])
    expect(await vaultHolds('mainnet', 'GSRC', 'CVAULT')).toBe(true)
  })

  it('says no for a vault out of any pool with nothing idle', async () => {
    reads(5, [0n, 0n])
    expect(await vaultHolds('mainnet', 'GSRC', 'CVAULT')).toBe(false)
  })

  it('says yes when one token sits idle', async () => {
    reads(5, [0n, 3n])
    expect(await vaultHolds('mainnet', 'GSRC', 'CVAULT')).toBe(true)
  })

  it('keeps a vault in view when its reads fail', async () => {
    simulateRead.mockRejectedValue(new Error('rpc down'))
    expect(await vaultHolds('mainnet', 'GSRC', 'CVAULT')).toBe(true)
  })
})
