import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotFoundError } from '@stellar/stellar-sdk'

// Mock the client module so getAccountBalances doesn't hit the real
// Horizon endpoint. We give it a fake `loadAccount` and `operations`
// implementation that returns the data we want to assert on.

const loadAccount = vi.fn()
const operationsCall = vi.fn()
const operationsForAccount = vi.fn(() => ({
  order: () => ({
    limit: () => ({
      call: operationsCall,
    }),
  }),
}))

vi.mock('../client', () => ({
  getHorizonServer: () => ({
    loadAccount,
    operations: () => ({
      forAccount: operationsForAccount,
    }),
  }),
}))

const { getAccountBalances, getRecentOperations } = await import('../account')

// Constructing a real NotFoundError without an actual HTTP response is
// awkward - the SDK constructor takes (message, response). We instantiate
// it with a stub object that's good enough for the SDK to be happy.
function makeNotFound(): NotFoundError {
  return new NotFoundError('not found', { status: 404 } as never)
}

describe('getAccountBalances', () => {
  beforeEach(() => {
    loadAccount.mockReset()
  })

  it('maps native + alphanum4 balance lines into AccountBalance', async () => {
    loadAccount.mockResolvedValueOnce({
      balances: [
        { asset_type: 'native', balance: '100.5000000' },
        { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: 'GISSUER', balance: '50.0000000' },
      ],
    })
    const result = await getAccountBalances('testnet', 'GACCOUNT')
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ code: 'XLM', balance: '100.5000000', isNative: true })
    expect(result[1]).toEqual({ code: 'USDC', issuer: 'GISSUER', balance: '50.0000000', isNative: false })
  })

  it('skips liquidity_pool_shares balance lines', async () => {
    loadAccount.mockResolvedValueOnce({
      balances: [
        { asset_type: 'native', balance: '10' },
        { asset_type: 'liquidity_pool_shares', liquidity_pool_id: 'abc', balance: '1' },
      ],
    })
    const result = await getAccountBalances('testnet', 'GACCOUNT')
    expect(result).toHaveLength(1)
    expect(result[0].isNative).toBe(true)
  })

  it('returns [] when the account is not found (NotFoundError)', async () => {
    loadAccount.mockRejectedValueOnce(makeNotFound())
    const result = await getAccountBalances('testnet', 'GMISSING')
    expect(result).toEqual([])
  })

  it('re-throws non-404 errors', async () => {
    loadAccount.mockRejectedValueOnce(new Error('rate limit'))
    await expect(getAccountBalances('testnet', 'GFAIL')).rejects.toThrow('rate limit')
  })

  it('re-throws errors that LOOK like 404 but aren\'t NotFoundError instances', async () => {
    loadAccount.mockRejectedValueOnce({ response: { status: 404 } })
    await expect(getAccountBalances('testnet', 'GWEIRD')).rejects.toBeTruthy()
  })
})

describe('getRecentOperations', () => {
  beforeEach(() => {
    operationsCall.mockReset()
  })

  it('shapes Horizon operation records into AccountOperation', async () => {
    operationsCall.mockResolvedValueOnce({
      records: [
        {
          id: '12345-0',
          type: 'payment',
          created_at: '2026-05-11T10:00:00Z',
          transaction_hash: 'abc123',
          transaction_successful: true,
        },
      ],
    })
    const ops = await getRecentOperations('testnet', 'GACCOUNT', 5)
    expect(ops).toHaveLength(1)
    expect(ops[0]).toEqual({
      id: '12345-0',
      type: 'payment',
      createdAt: '2026-05-11T10:00:00Z',
      transactionHash: 'abc123',
      successful: true,
    })
  })

  it('returns [] for unknown accounts (NotFoundError)', async () => {
    operationsCall.mockRejectedValueOnce(makeNotFound())
    const ops = await getRecentOperations('testnet', 'GMISSING')
    expect(ops).toEqual([])
  })
})
