import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NotFoundError } from '@stellar/stellar-sdk'
import { CONTRACTS } from '../../../config/contracts'

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

// the soroban USDC read is exercised on its own in token-balance.test.ts;
// here we stub it so the balance mapping stays the unit under test.
const sorobanTokenBalance = vi.fn()
vi.mock('../../stellar/token-balance', () => ({
  getSorobanTokenBalance: (...args: unknown[]) => sorobanTokenBalance(...args),
}))

const { getAccountBalances } = await import('../account')

// Constructing a real NotFoundError without an actual HTTP response is
// awkward - the SDK constructor takes (message, response). We instantiate
// it with a stub object that's good enough for the SDK to be happy.
function makeNotFound(): NotFoundError {
  return new NotFoundError('not found', { status: 404 } as never)
}

describe('getAccountBalances', () => {
  beforeEach(() => {
    loadAccount.mockReset()
    // default: no soroban USDC, so the classic mapping tests are unaffected.
    sorobanTokenBalance.mockReset()
    sorobanTokenBalance.mockResolvedValue(null)
  })

  it('maps native + alphanum4 balance lines into AccountBalance', async () => {
    loadAccount.mockResolvedValueOnce({
      balances: [
        { asset_type: 'native', balance: '100.5000000' },
        { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: 'GISSUER', balance: '50.0000000' },
      ],
    })
    const balances = await getAccountBalances('testnet', 'GACCOUNT')
    expect(balances).toHaveLength(2)
    expect(balances[0]).toEqual({ code: 'XLM', balance: '100.5000000', isNative: true })
    expect(balances[1]).toEqual({ code: 'USDC', issuer: 'GISSUER', balance: '50.0000000', isNative: false })
  })

  it('skips liquidity_pool_shares balance lines', async () => {
    loadAccount.mockResolvedValueOnce({
      balances: [
        { asset_type: 'native', balance: '10' },
        { asset_type: 'liquidity_pool_shares', liquidity_pool_id: 'abc', balance: '1' },
      ],
    })
    const balances = await getAccountBalances('testnet', 'GACCOUNT')
    expect(balances).toHaveLength(1)
    expect(balances[0].isNative).toBe(true)
  })

  it('appends the soroban USDC balance Horizon cannot see', async () => {
    loadAccount.mockResolvedValueOnce({
      balances: [{ asset_type: 'native', balance: '9991.0000000' }],
    })
    sorobanTokenBalance.mockResolvedValueOnce(124_200_000n) // 12.42 USDC in stroops
    const balances = await getAccountBalances('testnet', 'GACCOUNT')
    expect(sorobanTokenBalance).toHaveBeenCalledWith(
      'testnet',
      CONTRACTS.testnet.tokens.usdcSac,
      'GACCOUNT',
    )
    expect(balances).toHaveLength(2)
    expect(balances[1]).toEqual({
      code: 'USDC',
      issuer: CONTRACTS.testnet.tokens.usdcSac,
      balance: '12.4200000',
      isNative: false,
    })
  })

  it('does not append USDC when a classic USDC line is already present', async () => {
    loadAccount.mockResolvedValueOnce({
      balances: [
        { asset_type: 'native', balance: '10' },
        { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: 'GISSUER', balance: '5' },
      ],
    })
    const balances = await getAccountBalances('testnet', 'GACCOUNT')
    expect(sorobanTokenBalance).not.toHaveBeenCalled()
    expect(balances).toHaveLength(2)
  })

  it('reads an account that is not on the ledger as holding nothing', async () => {
    loadAccount.mockRejectedValueOnce(makeNotFound())
    const balances = await getAccountBalances('testnet', 'GMISSING')
    expect(balances).toEqual([])
  })

  it('re-throws non-404 errors', async () => {
    loadAccount.mockRejectedValueOnce(new Error('rate limit'))
    await expect(getAccountBalances('testnet', 'GFAIL')).rejects.toThrow('rate limit')
  })

  it('treats a bare 404 as missing even without a NotFoundError instance', async () => {
    // instanceof can miss when two sdk copies are loaded, and a 404 on an account
    // read only ever means the account is not there, so the status is enough.
    loadAccount.mockRejectedValueOnce({ response: { status: 404 } })
    const balances = await getAccountBalances('testnet', 'GWEIRD')
    expect(balances).toEqual([])
  })
})
