import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'

const { fromXDRMock } = vi.hoisted(() => ({
  fromXDRMock: vi.fn(),
}))

vi.mock('@stellar/stellar-sdk', async (orig) => {
  const actual = await orig<typeof import('@stellar/stellar-sdk')>()
  return {
    ...actual,
    TransactionBuilder: { fromXDR: fromXDRMock },
    FeeBumpTransaction: actual.FeeBumpTransaction,
  }
})

vi.mock('../client', () => ({
  getBrokerClient: vi.fn(),
}))

import { makeSignCallback } from '../swap'
import type { Signer } from '../../signer/types'

const PASSPHRASE = 'Test SDF Network ; September 2015'
const ACCOUNT = 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU'

function buildSigner(): Signer & { signTransaction: Mock<Signer['signTransaction']> } {
  return {
    name: 'wallet-kit',
    signTransaction: vi.fn<Signer['signTransaction']>(),
  }
}

beforeEach(() => {
  fromXDRMock.mockReset()
})

describe('makeSignCallback', () => {
  it('rejects buffer payloads (no soroban auth-entry signing path)', async () => {
    const signer = buildSigner()
    const cb = makeSignCallback(ACCOUNT, PASSPHRASE, signer)
    await expect(cb(Buffer.from([1, 2, 3]))).rejects.toThrow(/soroban auth-entry/i)
    expect(signer.signTransaction).not.toHaveBeenCalled()
  })

  it('round-trips a tx payload through the signer', async () => {
    const signedTx = { reconstructed: true, hash: () => Buffer.from('deadbeef', 'hex') }
    fromXDRMock
      .mockReturnValueOnce({ source: ACCOUNT, operations: [{ type: 'pathPaymentStrictSend' }] })
      .mockReturnValueOnce(signedTx)
    const signer = buildSigner()
    signer.signTransaction.mockResolvedValueOnce({ signedTxXdr: 'SIGNED_XDR' })

    const cb = makeSignCallback(ACCOUNT, PASSPHRASE, signer)
    const fakeTx = { toXDR: () => 'RAW_XDR' } as unknown as Parameters<typeof cb>[0]
    const out = await cb(fakeTx)

    expect(signer.signTransaction).toHaveBeenCalledWith('RAW_XDR', {
      networkPassphrase: PASSPHRASE,
      address: ACCOUNT,
    })
    expect(out).toBe(signedTx)
  })

  it('calls onHash with the hex hash of every signed leg when provided', async () => {
    const signedTx = { reconstructed: true, hash: () => Buffer.from('deadbeefcafe', 'hex') }
    fromXDRMock
      .mockReturnValueOnce({ source: ACCOUNT, operations: [{ type: 'pathPaymentStrictSend' }] })
      .mockReturnValueOnce(signedTx)
    const signer = buildSigner()
    signer.signTransaction.mockResolvedValueOnce({ signedTxXdr: 'SIGNED_XDR' })
    const hashes: string[] = []

    const cb = makeSignCallback(ACCOUNT, PASSPHRASE, signer, (h) => hashes.push(h))
    const fakeTx = { toXDR: () => 'RAW_XDR' } as unknown as Parameters<typeof cb>[0]
    await cb(fakeTx)

    expect(hashes).toEqual(['deadbeefcafe'])
  })

  it('does not break when onHash throws', async () => {
    const signedTx = { reconstructed: true, hash: () => Buffer.from('abcd', 'hex') }
    fromXDRMock
      .mockReturnValueOnce({ source: ACCOUNT, operations: [{ type: 'pathPaymentStrictSend' }] })
      .mockReturnValueOnce(signedTx)
    const signer = buildSigner()
    signer.signTransaction.mockResolvedValueOnce({ signedTxXdr: 'SIGNED_XDR' })

    const cb = makeSignCallback(ACCOUNT, PASSPHRASE, signer, () => {
      throw new Error('downstream listener crashed')
    })
    const fakeTx = { toXDR: () => 'RAW_XDR' } as unknown as Parameters<typeof cb>[0]
    const out = await cb(fakeTx)
    expect(out).toBe(signedTx)
  })

  it('propagates signer rejection unchanged', async () => {
    fromXDRMock.mockReturnValueOnce({ source: ACCOUNT, operations: [{ type: 'pathPaymentStrictSend' }] })
    const signer = buildSigner()
    signer.signTransaction.mockRejectedValueOnce(new Error('user denied'))
    const cb = makeSignCallback(ACCOUNT, PASSPHRASE, signer)
    const fakeTx = { toXDR: () => 'X' } as unknown as Parameters<typeof cb>[0]
    await expect(cb(fakeTx)).rejects.toThrow('user denied')
  })

  it('refuses a tx whose source is not the trader', async () => {
    fromXDRMock.mockReturnValueOnce({
      source: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      operations: [{ type: 'pathPaymentStrictSend' }],
    })
    const signer = buildSigner()
    const cb = makeSignCallback(ACCOUNT, PASSPHRASE, signer)
    const fakeTx = { toXDR: () => 'X' } as unknown as Parameters<typeof cb>[0]
    await expect(cb(fakeTx)).rejects.toThrow(/does not match trader/i)
    expect(signer.signTransaction).not.toHaveBeenCalled()
  })

  it('refuses an op type not on the swap allowlist', async () => {
    fromXDRMock.mockReturnValueOnce({
      source: ACCOUNT,
      operations: [{ type: 'accountMerge' }],
    })
    const signer = buildSigner()
    const cb = makeSignCallback(ACCOUNT, PASSPHRASE, signer)
    const fakeTx = { toXDR: () => 'X' } as unknown as Parameters<typeof cb>[0]
    await expect(cb(fakeTx)).rejects.toThrow(/not allowed in a swap envelope/i)
    expect(signer.signTransaction).not.toHaveBeenCalled()
  })

  it('refuses an op whose source is not the trader', async () => {
    fromXDRMock.mockReturnValueOnce({
      source: ACCOUNT,
      operations: [{ type: 'pathPaymentStrictSend', source: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5' }],
    })
    const signer = buildSigner()
    const cb = makeSignCallback(ACCOUNT, PASSPHRASE, signer)
    const fakeTx = { toXDR: () => 'X' } as unknown as Parameters<typeof cb>[0]
    await expect(cb(fakeTx)).rejects.toThrow(/not the trader/i)
    expect(signer.signTransaction).not.toHaveBeenCalled()
  })
})
