import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Address, Networks, nativeToScVal, xdr } from '@stellar/stellar-sdk'

import { networkPassphrase } from '../client'
import { handleSendResult, TransactionRefusedError, TryAgainLaterError, waitForTx, buildPingTx, getLatestVaults } from '../factory'

const simulateTransaction = vi.fn()
const getTransaction = vi.fn()
const getAccount = vi.fn()

vi.mock('../client', async () => {
  const real = await vi.importActual<typeof import('../client')>('../client')
  return {
    ...real,
    getSorobanServer: () => ({ simulateTransaction, getTransaction, getAccount }),
  }
})

vi.mock('@stellar/stellar-sdk', async () => {
  const actual = await vi.importActual<typeof import('@stellar/stellar-sdk')>('@stellar/stellar-sdk')
  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      Api: {
        ...actual.rpc.Api,
        isSimulationError: (s: { error?: string }) => 'error' in s && !!s.error,
        isSimulationRestore: (s: { restorePreamble?: unknown }) => !!s.restorePreamble,
      },
      assembleTransaction: () => ({
        build: () => ({ toXDR: () => 'ASSEMBLED_XDR' }),
      }),
    },
  }
})

const TESTNET_SOURCE = 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU'

describe('network passphrase', () => {
  it('gives mainnet the public passphrase', () => {
    expect(networkPassphrase('mainnet')).toBe(Networks.PUBLIC)
  })
  it('gives testnet its own, so a signature cannot cross networks', () => {
    expect(networkPassphrase('testnet')).toBe(Networks.TESTNET)
  })
})

describe('handleSendResult', () => {
  it('takes PENDING as sent and hands back the hash', () => {
    expect(handleSendResult({ status: 'PENDING', hash: 'h1' })).toBe('h1')
  })
  it('treats DUPLICATE as already sent rather than as a failure', () => {
    expect(handleSendResult({ status: 'DUPLICATE', hash: 'h2' })).toBe('h2')
  })
  it('raises TryAgainLaterError so the caller can back off', () => {
    expect(() => handleSendResult({ status: 'TRY_AGAIN_LATER', hash: 'hx' })).toThrow(
      TryAgainLaterError,
    )
  })
  it('carries the error payload out rather than a bare status', () => {
    expect(() =>
      handleSendResult({ status: 'ERROR', hash: 'hx', errorResult: { e: 'malformed' } }),
    ).toThrow(/malformed/)
  })
  it('says in words that an expired transaction sent nothing, and keeps the code', () => {
    const tooLate = new xdr.TransactionResult({
      feeCharged: xdr.Int64.fromString('24095'),
      result: xdr.TransactionResultResult.txTooLate(),
      ext: new xdr.TransactionResultExt(0),
    })
    let caught: unknown
    try {
      handleSendResult({ status: 'ERROR', hash: 'hx', errorResult: tooLate })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(TransactionRefusedError)
    expect((caught as TransactionRefusedError).code).toBe('txTooLate')
    expect((caught as Error).message).toMatch(/expired before it reached the network.*Nothing was sent/)
    expect((caught as Error).message).not.toMatch(/_attributes|_switch/)
  })
  it('names a refusal it has no sentence for', () => {
    const malformed = new xdr.TransactionResult({
      feeCharged: xdr.Int64.fromString('100'),
      result: xdr.TransactionResultResult.txMalformed(),
      ext: new xdr.TransactionResultExt(0),
    })
    expect(() => handleSendResult({ status: 'ERROR', hash: 'hx', errorResult: malformed })).toThrow(
      'Stellar refused the transaction (txMalformed). Nothing was sent.',
    )
  })
  it('refuses a status it does not know instead of guessing', () => {
    expect(() => handleSendResult({ status: 'WAT', hash: 'hz' })).toThrow(/Unknown/)
  })
})

describe('buildPingTx', () => {
  beforeEach(() => {
    simulateTransaction.mockReset()
    getAccount.mockReset()
    getAccount.mockResolvedValue({
      accountId: () => TESTNET_SOURCE,
      sequenceNumber: () => '0',
      incrementSequenceNumber: () => undefined,
    })
  })

  it('returns the assembled XDR when simulation succeeds', async () => {
    simulateTransaction.mockResolvedValueOnce({ result: { retval: null } })
    const { xdr } = await buildPingTx('testnet', TESTNET_SOURCE)
    expect(xdr).toBe('ASSEMBLED_XDR')
  })

  it('throws when simulation returns an error', async () => {
    simulateTransaction.mockResolvedValueOnce({ error: 'guest panic' })
    await expect(buildPingTx('testnet', TESTNET_SOURCE)).rejects.toThrow(/simulation failed/)
  })

  it('returns the restore preamble instead of throwing when storage is archived', async () => {
    simulateTransaction.mockResolvedValueOnce({
      result: { retval: null },
      restorePreamble: { minResourceFee: '1000', transactionData: 'PREAMBLE_DATA' },
    })
    const { xdr, restorePreamble } = await buildPingTx('testnet', TESTNET_SOURCE)
    expect(xdr).toBe('')
    expect(restorePreamble).toEqual({ minResourceFee: '1000', transactionData: 'PREAMBLE_DATA' })
  })
})

describe('getLatestVaults', () => {
  const VAULT = 'CBEWCQWMKYRBHN2H6GIEYQS4UACN3DHC3KUXHX5F3AOZAKCG5VI7WGQ4'
  const OWNER = 'GA3FDPNGWE7T2ANXNB5LNPRLZMC2LBYJFO2VVKW7DRUZTGNIKZDKOXCS'
  const XLM = 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA'
  const USDC = 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75'

  const pool = (vault: string) => ({
    result: {
      retval: nativeToScVal({
        lobster_address: new Address(vault),
        owner: new Address(OWNER),
        token0: new Address(XLM),
        token1: new Address(USDC),
      }),
    },
  })

  beforeEach(() => {
    simulateTransaction.mockReset()
  })

  it('reads ids from the pool count down, so the newest vault comes first', async () => {
    const OLDER = 'CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH'
    simulateTransaction.mockResolvedValueOnce(pool(VAULT)).mockResolvedValueOnce(pool(OLDER))
    const vaults = await getLatestVaults('mainnet', 2, 10)
    expect(simulateTransaction).toHaveBeenCalledTimes(2)
    expect(vaults.map((v) => v.lobsterAddress)).toEqual([VAULT, OLDER])
    expect(vaults[0]).toEqual({ lobsterAddress: VAULT, owner: OWNER, token0: XLM, token1: USDC })
  })

  it('stops at the limit and leaves out an id that reads empty or fails', async () => {
    simulateTransaction
      .mockResolvedValueOnce(pool(VAULT))
      .mockResolvedValueOnce({ result: { retval: xdr.ScVal.scvVoid() } })
      .mockRejectedValueOnce(new Error('rpc down'))
    const vaults = await getLatestVaults('testnet', 12, 3)
    expect(simulateTransaction).toHaveBeenCalledTimes(3)
    expect(vaults.map((v) => v.lobsterAddress)).toEqual([VAULT])
  })
})

describe('waitForTx', () => {
  beforeEach(() => {
    getTransaction.mockReset()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns the response when status is final on first poll', async () => {
    getTransaction.mockResolvedValueOnce({ status: 'SUCCESS' })
    const p = waitForTx('testnet', 'hash1')
    await expect(p).resolves.toEqual({ status: 'SUCCESS' })
  })

  it('keeps polling NOT_FOUND until a final status arrives', async () => {
    getTransaction
      .mockResolvedValueOnce({ status: 'NOT_FOUND' })
      .mockResolvedValueOnce({ status: 'NOT_FOUND' })
      .mockResolvedValueOnce({ status: 'SUCCESS', hash: 'hash1' })
    const p = waitForTx('testnet', 'hash1')
    await vi.advanceTimersByTimeAsync(3_000)
    await vi.advanceTimersByTimeAsync(3_000)
    await expect(p).resolves.toEqual({ status: 'SUCCESS', hash: 'hash1' })
  })
})
