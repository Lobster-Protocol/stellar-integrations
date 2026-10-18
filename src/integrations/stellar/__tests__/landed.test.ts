import { describe, it, expect, vi, afterEach } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

const { call } = vi.hoisted(() => ({ call: vi.fn() }))
vi.mock('../../horizon/client', () => ({
  getHorizonServer: () => ({ transactions: () => ({ transaction: () => ({ call }) }) }),
}))

import { horizonHasTx, onTxLanded, refreshBalancesOnLanded, txLanded } from '../landed'

const stale = (qc: QueryClient, key: unknown[]) => qc.getQueryState(key)?.isInvalidated ?? false

function clientWith(keys: unknown[][]) {
  const qc = new QueryClient()
  for (const key of keys) qc.setQueryData(key, 'cached')
  return qc
}

afterEach(() => {
  call.mockReset()
})

describe('a transaction that landed', () => {
  it('reaches every listener until it unsubscribes', () => {
    const seen = vi.fn()
    const off = onTxLanded(seen)
    txLanded('mainnet', 'h1')
    off()
    txLanded('mainnet', 'h2')
    expect(seen).toHaveBeenCalledTimes(1)
    expect(seen).toHaveBeenCalledWith('mainnet', 'h1')
  })

  it("refreshes the open window's own balance at once, and the rest once Horizon has the transaction", async () => {
    const qc = clientWith([
      ['swap-sac-balance', 'mainnet', 'GOWNER', 'CXLM'],
      ['horizon', 'balances', 'mainnet', 'GOWNER'],
      ['lobster', 'vaults', 'mainnet', 'GOWNER'],
      ['trustline', 'GOWNER', 'USDC', 'GISSUER', 'mainnet', false],
    ])
    let ingested!: () => void
    const off = refreshBalancesOnLanded(qc, () => new Promise<boolean>((r) => (ingested = () => r(true))))
    txLanded('mainnet', 'h1')

    expect(stale(qc, ['swap-sac-balance', 'mainnet', 'GOWNER', 'CXLM'])).toBe(true)
    expect(stale(qc, ['horizon', 'balances', 'mainnet', 'GOWNER'])).toBe(false)

    ingested()
    await vi.waitFor(() => expect(stale(qc, ['horizon', 'balances', 'mainnet', 'GOWNER'])).toBe(true))
    expect(stale(qc, ['lobster', 'vaults', 'mainnet', 'GOWNER'])).toBe(true)
    expect(stale(qc, ['trustline', 'GOWNER', 'USDC', 'GISSUER', 'mainnet', false])).toBe(true)
    off()
  })

  it('leaves the other network and what no transaction changes alone', async () => {
    const qc = clientWith([
      ['horizon', 'balances', 'testnet', 'GOWNER'],
      ['price', 'xlm', 'mainnet'],
      ['ttl', 'mainnet'],
      ['horizon', 'balances', 'mainnet', 'GOWNER'],
    ])
    const off = refreshBalancesOnLanded(qc, async () => true)
    txLanded('mainnet', 'h1')

    await vi.waitFor(() => expect(stale(qc, ['horizon', 'balances', 'mainnet', 'GOWNER'])).toBe(true))
    expect(stale(qc, ['horizon', 'balances', 'testnet', 'GOWNER'])).toBe(false)
    expect(stale(qc, ['price', 'xlm', 'mainnet'])).toBe(false)
    expect(stale(qc, ['ttl', 'mainnet'])).toBe(false)
    off()
  })
})

describe('waiting for Horizon to have the transaction', () => {
  it('keeps asking until Horizon finds it', async () => {
    call.mockRejectedValueOnce(new Error('Not Found')).mockRejectedValueOnce(new Error('Not Found')).mockResolvedValue({})
    await expect(horizonHasTx('mainnet', 'h1', 1_000, 1)).resolves.toBe(true)
    expect(call).toHaveBeenCalledTimes(3)
  })

  it('gives up once the wait is over', async () => {
    call.mockRejectedValue(new Error('Not Found'))
    await expect(horizonHasTx('mainnet', 'h1', 20, 1)).resolves.toBe(false)
  })
})
