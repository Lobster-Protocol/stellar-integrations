import { describe, it, expect, vi, beforeEach } from 'vitest'
import { WaitForTransactionReceiptTimeoutError } from 'viem'

const m = vi.hoisted(() => ({ write: vi.fn(), wait: vi.fn(), account: vi.fn(), read: vi.fn() }))
vi.mock('wagmi/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi/actions')>()),
  writeContract: m.write,
  waitForTransactionReceipt: m.wait,
  getAccount: m.account,
  readContract: m.read,
}))

import { approveUsdc, burnToStellar, EvmBurnError, ReceiptUnreadError, UserRejectedError } from '../evm-burn'
import { CONTRACTS, cctpChain } from '../../../config/contracts'

const chain = cctpChain('testnet', 'BASE')
const HASH = `0x${'cd'.repeat(32)}` as const
const req = {
  chain,
  units: 1_000_000n,
  recipient: 'GAMNA2Q6NTZSUBLMEXLTIXYORE7OXJJBMEGIX7T2OXDAKIA7CCKN4RJV',
  forwarder: CONTRACTS.testnet.cctp.forwarder,
  maxFee: 200n,
  finality: 'fast' as const,
}

beforeEach(() => {
  m.write.mockReset()
  m.wait.mockReset()
  m.read.mockReset()
  m.account.mockReturnValue({ address: '0x1111111111111111111111111111111111111111', chainId: chain.chainId })
})

describe('burnToStellar', () => {
  it('hands the hash over as soon as the burn leaves the wallet', async () => {
    const seen: string[] = []
    m.write.mockResolvedValueOnce(HASH)
    m.wait.mockImplementationOnce(async () => {
      // the hash is known before anyone waits on the receipt
      expect(seen).toEqual([HASH])
      return { status: 'success' }
    })
    await expect(burnToStellar(req, (h) => seen.push(h))).resolves.toBe(HASH)
  })

  it('keeps a burn whose receipt no endpoint returned as sent, not failed', async () => {
    const onSent = vi.fn()
    m.write.mockResolvedValueOnce(HASH)
    m.wait.mockRejectedValueOnce(new WaitForTransactionReceiptTimeoutError({ hash: HASH }))
    const err = await burnToStellar(req, onSent).catch((e) => e)
    expect(err).toBeInstanceOf(ReceiptUnreadError)
    expect(err.hash).toBe(HASH)
    expect(onSent).toHaveBeenCalledWith(HASH)
  })

  it('reports a burn reverted on chain as a failure', async () => {
    m.write.mockResolvedValueOnce(HASH)
    m.wait.mockResolvedValueOnce({ status: 'reverted' })
    await expect(burnToStellar(req, vi.fn())).rejects.toThrow(EvmBurnError)
  })

  it('never reports a hash for a burn the wallet declined', async () => {
    const onSent = vi.fn()
    m.write.mockRejectedValueOnce(Object.assign(new Error('User rejected the request.'), { code: 4001 }))
    await expect(burnToStellar(req, onSent)).rejects.toBeInstanceOf(UserRejectedError)
    expect(onSent).not.toHaveBeenCalled()
  })
})

describe('approveUsdc', () => {
  it('goes on when only the receipt is missing and the allowance is there', async () => {
    m.write.mockResolvedValueOnce(HASH)
    m.wait.mockRejectedValueOnce(new WaitForTransactionReceiptTimeoutError({ hash: HASH }))
    m.read.mockResolvedValueOnce(1_000_000n)
    await expect(approveUsdc(chain, 1_000_000n)).resolves.toBe(HASH)
  })

  it('still fails an approval reverted on chain', async () => {
    m.write.mockResolvedValueOnce(HASH)
    m.wait.mockResolvedValueOnce({ status: 'reverted' })
    await expect(approveUsdc(chain, 1_000_000n)).rejects.toThrow(EvmBurnError)
  })
})
