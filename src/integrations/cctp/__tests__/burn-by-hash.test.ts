import { describe, it, expect, vi, beforeEach } from 'vitest'
import { encodeAbiParameters, encodeEventTopics, TransactionReceiptNotFoundError, type Hex } from 'viem'

const { receiptMock } = vi.hoisted(() => ({ receiptMock: vi.fn() }))
vi.mock('wagmi/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi/actions')>()),
  getTransactionReceipt: receiptMock,
}))

import { readBurnToStellar } from '../evm-burn'
import { contractToBytes32, encodeForwardHook, toHex } from '../forward-hook'
import { CONTRACTS, cctpChain } from '../../../config/contracts'

const chain = cctpChain('testnet', 'BASE')
const FORWARDER = CONTRACTS.testnet.cctp.forwarder
const RECIPIENT = 'GAMNA2Q6NTZSUBLMEXLTIXYORE7OXJJBMEGIX7T2OXDAKIA7CCKN4RJV'
const HASH = `0x${'ab'.repeat(32)}` as const
const EVENT = [
  {
    type: 'event',
    name: 'DepositForBurn',
    inputs: [
      { name: 'burnToken', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
      { name: 'depositor', type: 'address', indexed: true },
      { name: 'mintRecipient', type: 'bytes32', indexed: false },
      { name: 'destinationDomain', type: 'uint32', indexed: false },
      { name: 'destinationTokenMessenger', type: 'bytes32', indexed: false },
      { name: 'destinationCaller', type: 'bytes32', indexed: false },
      { name: 'maxFee', type: 'uint256', indexed: false },
      { name: 'minFinalityThreshold', type: 'uint32', indexed: true },
      { name: 'hookData', type: 'bytes', indexed: false },
    ],
  },
] as const

function burnLog(over: Partial<{ domain: number; mintRecipient: Hex; caller: Hex; finality: number; address: Hex }> = {}) {
  const forwarder32 = toHex(contractToBytes32(FORWARDER))
  const topics = encodeEventTopics({
    abi: EVENT,
    eventName: 'DepositForBurn',
    args: { burnToken: chain.usdc, depositor: '0x1111111111111111111111111111111111111111', minFinalityThreshold: over.finality ?? 1000 },
  })
  const data = encodeAbiParameters(
    [{ type: 'uint256' }, { type: 'bytes32' }, { type: 'uint32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'bytes' }],
    [1_170_000n, over.mintRecipient ?? forwarder32, over.domain ?? 27, `0x${'11'.repeat(32)}`, over.caller ?? forwarder32, 200n, toHex(encodeForwardHook(RECIPIENT))],
  )
  return { address: over.address ?? chain.tokenMessenger, topics, data, blockHash: HASH, blockNumber: 1n, logIndex: 0, transactionHash: HASH, transactionIndex: 0, removed: false }
}

beforeEach(() => receiptMock.mockReset())

describe('readBurnToStellar', () => {
  it('reads who a burn pays on Stellar, how much and how fast', async () => {
    receiptMock.mockResolvedValueOnce({ status: 'success', logs: [burnLog()] })
    await expect(readBurnToStellar(chain, HASH, FORWARDER)).resolves.toEqual({ units: 1_170_000n, recipient: RECIPIENT, finality: 'fast' })
  })

  it('takes a burn with no named caller, anyone may deliver it', async () => {
    receiptMock.mockResolvedValueOnce({ status: 'success', logs: [burnLog({ caller: `0x${'00'.repeat(32)}`, finality: 2000 })] })
    await expect(readBurnToStellar(chain, HASH, FORWARDER)).resolves.toMatchObject({ finality: 'standard' })
  })

  it('refuses something that is not a transaction hash', async () => {
    await expect(readBurnToStellar(chain, '0x1234', FORWARDER)).rejects.toThrow('Enter a transaction hash')
    expect(receiptMock).not.toHaveBeenCalled()
  })

  it('says so when the chain has no such transaction', async () => {
    receiptMock.mockRejectedValueOnce(new TransactionReceiptNotFoundError({ hash: HASH }))
    await expect(readBurnToStellar(chain, HASH, FORWARDER)).rejects.toThrow('No confirmed transaction with that hash on Base Sepolia')
  })

  it('does not blame the hash when the endpoint fails', async () => {
    receiptMock.mockRejectedValueOnce(new Error('HTTP request failed. Status: 403'))
    await expect(readBurnToStellar(chain, HASH, FORWARDER)).rejects.toThrow('Could not read Base Sepolia just now. Try again in a moment.')
  })

  it('refuses a reverted transaction', async () => {
    receiptMock.mockResolvedValueOnce({ status: 'reverted', logs: [] })
    await expect(readBurnToStellar(chain, HASH, FORWARDER)).rejects.toThrow('reverted')
  })

  it('refuses a transaction that burned nothing, such as the approval', async () => {
    receiptMock.mockResolvedValueOnce({ status: 'success', logs: [] })
    await expect(readBurnToStellar(chain, HASH, FORWARDER)).rejects.toThrow('burned no USDC through CCTP')
  })

  it('ignores a look-alike event from another contract', async () => {
    receiptMock.mockResolvedValueOnce({ status: 'success', logs: [burnLog({ address: '0x000000000000000000000000000000000000dEaD' })] })
    await expect(readBurnToStellar(chain, HASH, FORWARDER)).rejects.toThrow('burned no USDC through CCTP')
  })

  it('refuses a burn bound for another chain', async () => {
    receiptMock.mockResolvedValueOnce({ status: 'success', logs: [burnLog({ domain: 3 })] })
    await expect(readBurnToStellar(chain, HASH, FORWARDER)).rejects.toThrow('another chain')
  })

  it('refuses a burn that does not mint to the forwarder', async () => {
    receiptMock.mockResolvedValueOnce({ status: 'success', logs: [burnLog({ mintRecipient: `0x${'22'.repeat(32)}` })] })
    await expect(readBurnToStellar(chain, HASH, FORWARDER)).rejects.toThrow("does not go through Circle's forwarder")
  })
})
