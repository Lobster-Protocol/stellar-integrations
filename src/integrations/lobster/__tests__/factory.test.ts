import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Networks } from '@stellar/stellar-sdk'
import { networkPassphrase } from '../client'

// handleSendResult is pure; tested directly instead of through submitSignedXdr
import { handleSendResult, TryAgainLaterError, waitForTx, buildPingTx } from '../factory'

// mocked soroban server for buildPingTx + waitForTx
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

describe('lobster/client', () => {
  it('returns the public passphrase for mainnet', () => {
    expect(networkPassphrase('mainnet')).toBe(Networks.PUBLIC)
  })
  it('returns the testnet passphrase for testnet', () => {
    expect(networkPassphrase('testnet')).toBe(Networks.TESTNET)
  })
})

describe('handleSendResult', () => {
  it('returns hash on PENDING', () => {
    expect(handleSendResult({ status: 'PENDING', hash: 'h1' })).toBe('h1')
  })
  it('returns hash on DUPLICATE', () => {
    expect(handleSendResult({ status: 'DUPLICATE', hash: 'h2' })).toBe('h2')
  })
  it('throws TryAgainLaterError on TRY_AGAIN_LATER', () => {
    expect(() => handleSendResult({ status: 'TRY_AGAIN_LATER', hash: 'hx' })).toThrow(
      TryAgainLaterError,
    )
  })
  it('throws an Error with the payload on ERROR', () => {
    expect(() =>
      handleSendResult({ status: 'ERROR', hash: 'hx', errorResult: { e: 'malformed' } }),
    ).toThrow(/malformed/)
  })
  it('throws on unknown statuses (defensive)', () => {
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
