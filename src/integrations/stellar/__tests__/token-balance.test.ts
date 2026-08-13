import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lobster/client', () => ({
  getSorobanServer: vi.fn(),
  networkPassphrase: vi.fn(() => 'Test SDF Network ; September 2015'),
}))

const { getSorobanServer } = await import('../../lobster/client')
const getSorobanServerMock = getSorobanServer as ReturnType<typeof vi.fn>

import { getSorobanTokenBalance } from '../token-balance'
import { CONTRACTS } from '../../../config/contracts'
import { Account, nativeToScVal } from '@stellar/stellar-sdk'

const TOKEN = CONTRACTS.testnet.tokens.usdcSac
const ACCOUNT = 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU'

function serverWith(sim: unknown) {
  return {
    getAccount: vi.fn().mockResolvedValue(new Account(ACCOUNT, '123')),
    simulateTransaction: vi.fn().mockResolvedValue(sim),
  }
}

beforeEach(() => {
  getSorobanServerMock.mockReset()
})

describe('getSorobanTokenBalance', () => {
  it('returns null on a malformed token id without touching rpc', async () => {
    const r = await getSorobanTokenBalance('testnet', 'not-a-contract', ACCOUNT)
    expect(r).toBeNull()
    expect(getSorobanServerMock).not.toHaveBeenCalled()
  })

  it('returns null on a malformed account id without touching rpc', async () => {
    const r = await getSorobanTokenBalance('testnet', TOKEN, 'not-an-account')
    expect(r).toBeNull()
    expect(getSorobanServerMock).not.toHaveBeenCalled()
  })

  it('returns null when the account is not on chain', async () => {
    getSorobanServerMock.mockReturnValue({
      getAccount: vi.fn().mockRejectedValue(new Error('account not found')),
      simulateTransaction: vi.fn(),
    })
    expect(await getSorobanTokenBalance('testnet', TOKEN, ACCOUNT)).toBeNull()
  })

  it('returns null on a simulation error', async () => {
    getSorobanServerMock.mockReturnValue(serverWith({ error: 'balance() failed' }))
    expect(await getSorobanTokenBalance('testnet', TOKEN, ACCOUNT)).toBeNull()
  })

  it('returns null when the balance reads back as zero', async () => {
    getSorobanServerMock.mockReturnValue(
      serverWith({ result: { retval: nativeToScVal(0n, { type: 'i128' }) } }),
    )
    expect(await getSorobanTokenBalance('testnet', TOKEN, ACCOUNT)).toBeNull()
  })

  it('returns the balance in stroops on a successful read', async () => {
    getSorobanServerMock.mockReturnValue(
      serverWith({ result: { retval: nativeToScVal(124_200_000n, { type: 'i128' }) } }),
    )
    expect(await getSorobanTokenBalance('testnet', TOKEN, ACCOUNT)).toBe(124_200_000n)
  })
})
