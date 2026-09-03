import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../lobster/client', async () => {
  const actual = await vi.importActual<typeof import('../../lobster/client')>('../../lobster/client')
  return {
    ...actual,
    getSorobanServer: vi.fn(),
    networkPassphrase: vi.fn(() => 'Test SDF Network ; September 2015'),
  }
})

// testnet now carries a real soroswap router, so blank it here to keep the
// no-router guard tests meaningful.
vi.mock('../../../config/contracts', async () => {
  const actual = await vi.importActual<typeof import('../../../config/contracts')>('../../../config/contracts')
  return {
    ...actual,
    CONTRACTS: {
      ...actual.CONTRACTS,
      testnet: { ...actual.CONTRACTS.testnet, soroswap: { factory: '', router: '' } },
    },
  }
})

const { getSorobanServer } = await import('../../lobster/client')
const getSorobanServerMock = getSorobanServer as ReturnType<typeof vi.fn>

import { quoteSoroswapDirect, buildSoroswapSwapTx } from '../soroswap-fallback'
import { Account, nativeToScVal } from '@stellar/stellar-sdk'

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

  it('quotes via a fabricated source, so an unfunded caller never blocks on getAccount', async () => {
    const getAccount = vi.fn().mockRejectedValue(new Error('account not found'))
    getSorobanServerMock.mockReturnValue({
      getAccount,
      simulateTransaction: vi.fn().mockResolvedValue({
        result: { retval: nativeToScVal([100_000_000n, 97_000_000n], { type: 'i128' }) },
      }),
    })
    const r = await quoteSoroswapDirect(VALID_PARAMS)
    expect(r).toBe(97_000_000n)
    expect(getAccount).not.toHaveBeenCalled()
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
