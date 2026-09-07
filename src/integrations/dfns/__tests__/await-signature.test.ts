import { describe, it, expect, vi, beforeEach } from 'vitest'

const pollSignatureResult = vi.fn()
const submitSignedXdr = vi.fn()
const waitForTx = vi.fn()

vi.mock('../relay', () => ({ pollSignatureResult: (...a: unknown[]) => pollSignatureResult(...a) }))
vi.mock('../../lobster/factory', () => ({
  submitSignedXdr: (...a: unknown[]) => submitSignedXdr(...a),
  waitForTx: (...a: unknown[]) => waitForTx(...a),
}))

import { awaitDfnsSignature } from '../await-signature'

beforeEach(() => {
  pollSignatureResult.mockReset()
  submitSignedXdr.mockReset()
  waitForTx.mockReset()
})

describe('awaitDfnsSignature', () => {
  it('returns the broadcast hash for a classic tx, without submitting', async () => {
    // dfns broadcast the classic tx itself, so the hash is the whole artifact
    pollSignatureResult.mockResolvedValueOnce({ txHash: 'HASH123' })
    const hash = await awaitDfnsSignature('sig-1', 'testnet')
    expect(hash).toBe('HASH123')
    expect(submitSignedXdr).not.toHaveBeenCalled()
  })

  it('submits the signed envelope for a soroban tx and returns the settled hash', async () => {
    // dfns only signed the soroban tx; this submits it through rpc
    pollSignatureResult.mockResolvedValueOnce({ signedTxXdr: 'ENV_XDR' })
    submitSignedXdr.mockResolvedValueOnce('SUBMITTED_HASH')
    waitForTx.mockResolvedValueOnce({ status: 'SUCCESS' })
    const hash = await awaitDfnsSignature('sig-2', 'testnet')
    expect(submitSignedXdr).toHaveBeenCalledWith('testnet', 'ENV_XDR')
    expect(hash).toBe('SUBMITTED_HASH')
  })

  it('throws when the submitted soroban tx does not succeed', async () => {
    pollSignatureResult.mockResolvedValueOnce({ signedTxXdr: 'ENV_XDR' })
    submitSignedXdr.mockResolvedValueOnce('SUBMITTED_HASH')
    waitForTx.mockResolvedValueOnce({ status: 'FAILED' })
    await expect(awaitDfnsSignature('sig-3', 'testnet')).rejects.toThrow(/FAILED/)
  })
})
