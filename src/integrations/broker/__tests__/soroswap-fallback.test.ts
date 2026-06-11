import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lobster/client', () => ({
  getSorobanServer: vi.fn(),
  networkPassphrase: vi.fn(() => 'Test SDF Network ; September 2015'),
}))

const { getSorobanServer } = await import('../../lobster/client')
const getSorobanServerMock = getSorobanServer as ReturnType<typeof vi.fn>

import { quoteSoroswapDirect, buildSoroswapSwapTx } from '../soroswap-fallback'
import { Account } from '@stellar/stellar-sdk'

const VALID_PARAMS = {
  network: 'mainnet' as const,
  callerAccount: 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU',
  sellingTokenId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  buyingTokenId: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
  amountInStroops: 100_000_000n,
}

beforeEach(() => {
  getSorobanServerMock.mockReset()
})

describe('quoteSoroswapDirect', () => {
  it('returns null when the network has no router contract configured', async () => {
    const r = await quoteSoroswapDirect({ ...VALID_PARAMS, network: 'testnet' })
    expect(r).toBeNull()
    expect(getSorobanServerMock).not.toHaveBeenCalled()
  })

  it('returns null when getAccount throws (caller account not on chain)', async () => {
    getSorobanServerMock.mockReturnValue({
      getAccount: vi.fn().mockRejectedValue(new Error('account not found')),
      simulateTransaction: vi.fn(),
    })
    const r = await quoteSoroswapDirect(VALID_PARAMS)
    expect(r).toBeNull()
  })

  it('returns null on a simulation error', async () => {
    const server = {
      getAccount: vi.fn().mockResolvedValue({ accountId: () => VALID_PARAMS.callerAccount, sequenceNumber: () => '1', incrementSequenceNumber: () => undefined }),
      simulateTransaction: vi.fn().mockResolvedValue({ error: 'router_get_amounts_out failed' }),
    }
    getSorobanServerMock.mockReturnValue(server)
    const r = await quoteSoroswapDirect(VALID_PARAMS)
    expect(r).toBeNull()
  })
})

describe('buildSoroswapSwapTx', () => {
  const BUILD_PARAMS = {
    network: 'mainnet' as const,
    callerAccount: 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU',
    sellingTokenId: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
    buyingTokenId: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
    amountInStroops: 100_000_000n,
    minAmountOut: 99_000_000n,
    deadlineUnix: Math.floor(Date.now() / 1000) + 180,
  }

  it('throws when the network has no router contract configured', async () => {
    await expect(
      buildSoroswapSwapTx({ ...BUILD_PARAMS, network: 'testnet' }),
    ).rejects.toThrow(/soroswap router not configured/i)
  })

  it('rejects a zero min amount out', async () => {
    await expect(
      buildSoroswapSwapTx({ ...BUILD_PARAMS, minAmountOut: 0n }),
    ).rejects.toThrow(/positive min amount/i)
  })

  it('throws InvalidStellarIdError on a malformed selling token id', async () => {
    await expect(
      buildSoroswapSwapTx({ ...BUILD_PARAMS, sellingTokenId: 'not-a-contract' }),
    ).rejects.toThrow(/invalid stellar contract/i)
  })

  it('throws InvalidStellarIdError on a malformed caller account', async () => {
    await expect(
      buildSoroswapSwapTx({ ...BUILD_PARAMS, callerAccount: 'not-a-g-address' }),
    ).rejects.toThrow(/invalid stellar account/i)
  })

  it('propagates server.getAccount errors instead of swallowing them', async () => {
    getSorobanServerMock.mockReturnValue({
      getAccount: vi.fn().mockRejectedValue(new Error('horizon unreachable')),
      simulateTransaction: vi.fn(),
    })
    await expect(buildSoroswapSwapTx(BUILD_PARAMS)).rejects.toThrow('horizon unreachable')
  })

  it('throws on a simulation error with the error message', async () => {
    const acct = new Account(BUILD_PARAMS.callerAccount, '12345')
    const server = {
      getAccount: vi.fn().mockResolvedValue(acct),
      simulateTransaction: vi
        .fn()
        .mockResolvedValue({ error: 'swap path unreachable' }),
    }
    getSorobanServerMock.mockReturnValue(server)
    await expect(buildSoroswapSwapTx(BUILD_PARAMS)).rejects.toThrow(/soroswap sim failed/i)
  })
})
