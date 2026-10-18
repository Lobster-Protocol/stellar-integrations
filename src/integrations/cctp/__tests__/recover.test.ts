import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Address, NotFoundError, nativeToScVal, rpc, xdr } from '@stellar/stellar-sdk'
import { getAddress, TransactionReceiptNotFoundError } from 'viem'

const { getLogsMock, blockNumberMock, txCountMock, receiptMock, irisMock, deliveredMock, horizonTxMock, horizonOpsMock, rpcTxMock } = vi.hoisted(() => ({
  getLogsMock: vi.fn(),
  blockNumberMock: vi.fn(),
  txCountMock: vi.fn(),
  receiptMock: vi.fn(),
  irisMock: vi.fn(),
  deliveredMock: vi.fn(),
  horizonTxMock: vi.fn(),
  horizonOpsMock: vi.fn(),
  rpcTxMock: vi.fn(),
}))
vi.mock('wagmi/actions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('wagmi/actions')>()),
  getPublicClient: () => ({ getLogs: getLogsMock }),
  getBlock: async () => ({ timestamp: 1_700_000_000n }),
  getTransactionReceipt: receiptMock,
}))
vi.mock('../iris', async (importOriginal) => ({ ...(await importOriginal<typeof import('../iris')>()), fetchAttestation: irisMock }))
vi.mock('../claim', async (importOriginal) => ({ ...(await importOriginal<typeof import('../claim')>()), isDeliveredOnStellar: deliveredMock }))
vi.mock('../../horizon/client', () => ({
  getHorizonServer: () => ({
    transactions: () => ({ transaction: () => ({ call: horizonTxMock }) }),
    operations: () => ({ forAccount: () => ({ order: () => ({ limit: () => ({ call: horizonOpsMock }) }) }) }),
  }),
}))
vi.mock('../../lobster/client', () => ({ getSorobanServer: () => ({ getTransaction: rpcTxMock }) }))
vi.mock('../evm-burn', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../evm-burn')>()),
  readBlockNumber: blockNumberMock,
  readTxCount: txCountMock,
}))

import {
  burnFromLog,
  burnFromOperation,
  evmBurnFate,
  findEvmBurnsToStellar,
  refusedForSize,
  resolveEvmIntent,
  searchEvmWallet,
  searchStellarAccount,
  stellarBurnFate,
} from '../recover'
import { markSettled } from '../transfers'
import { contractToBytes32, encodeForwardHook, toHex } from '../forward-hook'
import { evmAddressToBytes32 } from '../stellar-burn'
import type { BurnIntent } from '../transfers'
import { CCTP_SOURCE_CHAINS, CONTRACTS, cctpChain } from '../../../config/contracts'

const chain = cctpChain('testnet', 'BASE')
const FORWARDER = CONTRACTS.testnet.cctp.forwarder
const FORWARDER_32 = toHex(contractToBytes32(FORWARDER))
const RECIPIENT = 'GAMNA2Q6NTZSUBLMEXLTIXYORE7OXJJBMEGIX7T2OXDAKIA7CCKN4RJV'
const DEPOSITOR = '0xDCD592A255323772f9B1EF5db83D2A0CFcF91a37'
const HASH = `0x${'AB'.repeat(32)}` as const

function log(over: Record<string, unknown> = {}, args: Record<string, unknown> = {}) {
  return {
    transactionHash: HASH,
    blockNumber: 1_234n,
    ...over,
    args: {
      amount: 5_000_000n,
      mintRecipient: FORWARDER_32,
      destinationDomain: 27,
      destinationCaller: FORWARDER_32,
      minFinalityThreshold: 1000,
      hookData: toHex(encodeForwardHook(RECIPIENT)),
      ...args,
    },
  }
}

beforeEach(() => {
  for (const m of [getLogsMock, blockNumberMock, txCountMock, receiptMock, irisMock, deliveredMock, horizonTxMock, horizonOpsMock, rpcTxMock]) m.mockReset()
  localStorage.clear()
})

describe('a burn read from its log', () => {
  it('keeps a burn to Stellar through the forwarder, with who it pays and how fast', () => {
    expect(burnFromLog(log(), FORWARDER)).toEqual({
      hash: HASH.toLowerCase(),
      blockNumber: 1_234n,
      units: 5_000_000n,
      recipient: RECIPIENT,
      finality: 'fast',
    })
    expect(burnFromLog(log({}, { minFinalityThreshold: 2000 }), FORWARDER)?.finality).toBe('standard')
  })

  it('takes a burn anyone may deliver, with no caller named', () => {
    expect(burnFromLog(log({}, { destinationCaller: `0x${'00'.repeat(32)}` }), FORWARDER)).not.toBeNull()
  })

  it('leaves out what this page could not finish', () => {
    expect(burnFromLog(log({}, { destinationDomain: 3 }), FORWARDER)).toBeNull()
    expect(burnFromLog(log({}, { mintRecipient: `0x${'11'.repeat(32)}` }), FORWARDER)).toBeNull()
    expect(burnFromLog(log({}, { destinationCaller: `0x${'22'.repeat(32)}` }), FORWARDER)).toBeNull()
    expect(burnFromLog(log({}, { hookData: '0x1234' }), FORWARDER)).toBeNull()
    expect(burnFromLog(log({ transactionHash: null }), FORWARDER)).toBeNull()
  })
})

describe('an endpoint refusing a log query', () => {
  it('finds a size refusal in the data of a wrapped error', () => {
    const tenderly = { shortMessage: 'Invalid parameters were provided to the RPC method.', cause: { message: 'invalid params', data: 'Block range too large for public access: maximum 1000 blocks.' } }
    expect(refusedForSize(tenderly)).toBe(true)
    expect(refusedForSize({ message: 'invalid params', cause: { data: 'Archive requests require a personal token' } })).toBe(false)
  })

  it('sends mainnet log searches to archive endpoints, in pieces they take', () => {
    for (const c of CCTP_SOURCE_CHAINS.mainnet) expect(c.logsRpc?.length, c.key).toBeGreaterThan(0)
    expect(cctpChain('mainnet', 'BASE').logsSpan).toBeLessThanOrEqual(1_000)
    expect(Math.ceil(cctpChain('mainnet', 'BASE').searchBlocks / cctpChain('mainnet', 'BASE').logsSpan)).toBeLessThanOrEqual(60)
  })

  it('tells a range too big from blocks too old', () => {
    expect(refusedForSize(new Error('eth_getLogs is limited to a 2,000 range'))).toBe(true)
    expect(refusedForSize({ details: 'exceed maximum block range: 50000' })).toBe(true)
    expect(refusedForSize(new Error('Archive requests require a personal token'))).toBe(false)
    expect(refusedForSize(new Error('Unknown state. First available state is 1'))).toBe(false)
    expect(refusedForSize(new Error('fetch failed'))).toBe(false)
  })

  it('never takes a 403 or a 429 for a range too big, even when the text says limit', () => {
    expect(refusedForSize({ status: 429, details: 'over rate limit' })).toBe(false)
    expect(refusedForSize({ status: 403, shortMessage: 'HTTP request failed.' })).toBe(false)
    expect(refusedForSize({ message: 'request failed', cause: { status: 429 } })).toBe(false)
    expect(refusedForSize(new Error('Too Many Requests'))).toBe(false)
    expect(refusedForSize(new Error('rate limit exceeded'))).toBe(false)
  })
})

describe('searching a wallet for its burns', () => {
  it('walks back in pieces the endpoint takes, newest first', async () => {
    getLogsMock.mockResolvedValue([])
    const r = await findEvmBurnsToStellar(chain, DEPOSITOR, 0n, 25_000n, FORWARDER)
    expect(r).toEqual({ burns: [], reachedFrom: 0n, complete: true })
    expect(getLogsMock.mock.calls.map(([q]) => [q.fromBlock, q.toBlock])).toEqual([
      [15_001n, 25_000n],
      [5_001n, 15_000n],
      [0n, 5_000n],
    ])
    expect(getLogsMock.mock.calls[0][0].args).toEqual({ depositor: getAddress(DEPOSITOR) })
  })

  it('splits a piece refused for its size and carries on', async () => {
    getLogsMock.mockRejectedValueOnce(new Error('eth_getLogs is limited to a 1,000 range')).mockResolvedValue([log()])
    const r = await findEvmBurnsToStellar(chain, DEPOSITOR, 20_001n, 25_000n, FORWARDER)
    expect(r.complete).toBe(true)
    expect(getLogsMock.mock.calls[1][0]).toMatchObject({ fromBlock: 20_001n, toBlock: 25_000n })
    expect(r.burns).toHaveLength(1)
  })

  it('stops at the first throttled answer instead of splitting the piece', async () => {
    getLogsMock.mockRejectedValue(Object.assign(new Error('HTTP request failed.'), { status: 429, details: 'over rate limit' }))
    const r = await findEvmBurnsToStellar(chain, DEPOSITOR, 0n, 25_000n, FORWARDER)
    expect(r.complete).toBe(false)
    expect(getLogsMock).toHaveBeenCalledTimes(1)
  })

  it('stops where the endpoints stop serving blocks, and says how far it got', async () => {
    getLogsMock.mockResolvedValueOnce([log()]).mockRejectedValue(new Error('Archive requests require a personal token'))
    const r = await findEvmBurnsToStellar(chain, DEPOSITOR, 0n, 25_000n, FORWARDER)
    expect(r.complete).toBe(false)
    expect(r.reachedFrom).toBe(15_001n)
    expect(r.burns).toHaveLength(1)
    expect(r.error).toMatch(/Archive/)
  })
})

const TMM = CONTRACTS.testnet.cctp.tokenMessengerMinter
const EVM_TO = '0xdcd592a255323772f9b1ef5db83d2a0cfcf91a37'

function op(fn = 'deposit_for_burn_with_hook', contract = TMM, successful = true) {
  const p = (v: xdr.ScVal, type: string) => ({ type, value: v.toXDR('base64') })
  return {
    type: 'invoke_host_function',
    transaction_hash: 'c0ffee',
    transaction_successful: successful,
    created_at: '2026-10-02T12:42:57Z',
    parameters: [
      p(new Address(contract).toScVal(), 'Address'),
      p(xdr.ScVal.scvSymbol(fn), 'Sym'),
      p(new Address(RECIPIENT).toScVal(), 'Address'),
      p(nativeToScVal(2_999_610n, { type: 'i128' }), 'I128'),
      p(nativeToScVal(6, { type: 'u32' }), 'U32'),
      p(nativeToScVal(Buffer.from(evmAddressToBytes32(EVM_TO)), { type: 'bytes' }), 'Bytes'),
    ],
  }
}

describe('a burn out of Stellar read from the account history', () => {
  it('reads the amount, the chain, the wallet it pays and whether Circle mints it', () => {
    expect(burnFromOperation(op(), TMM)).toEqual({
      hash: 'c0ffee',
      at: Date.parse('2026-10-02T12:42:57Z'),
      units: 2_999_610n,
      domain: 6,
      recipient: getAddress(EVM_TO),
      forwarded: true,
    })
    expect(burnFromOperation(op('deposit_for_burn'), TMM)?.forwarded).toBe(false)
  })

  it('ignores any other call, contract or a call that failed', () => {
    expect(burnFromOperation(op('approve'), TMM)).toBeNull()
    expect(burnFromOperation(op('deposit_for_burn', CONTRACTS.testnet.cctp.forwarder), TMM)).toBeNull()
    expect(burnFromOperation(op('deposit_for_burn', TMM, false), TMM)).toBeNull()
    expect(burnFromOperation({ ...op(), type: 'payment' }, TMM)).toBeNull()
  })
})

function intent(over: Partial<BurnIntent> = {}): BurnIntent {
  return {
    id: 'intent-a',
    network: 'testnet',
    chainKey: 'BASE',
    chainName: 'Base Sepolia',
    amount: '5',
    units: '5000000',
    from: DEPOSITOR,
    recipient: RECIPIENT,
    finality: 'fast',
    startedAt: Date.now() - 60_000,
    session: 'a-page-that-closed',
    fromBlock: '1000',
    txCount: 7,
    ...over,
  }
}

describe('resolveEvmIntent', () => {
  it('finds the burn from the block the wallet was asked at, dated by that block', async () => {
    blockNumberMock.mockResolvedValue(2_000n)
    getLogsMock.mockResolvedValue([log()])
    const r = await resolveEvmIntent(intent(), new Set())
    expect(r.kind).toBe('found')
    if (r.kind !== 'found') return
    expect(r.transfer).toMatchObject({ id: HASH.toLowerCase(), direction: 'to-stellar', amount: '5', recipient: RECIPIENT, stage: 'burned' })
    expect(r.transfer.createdAt).toBe(1_700_000_000_000)
    expect(getLogsMock.mock.calls[0][0]).toMatchObject({ fromBlock: 998n, toBlock: 2_000n })
  })

  it('never takes another burn of the wallet for it', async () => {
    blockNumberMock.mockResolvedValue(2_000n)
    getLogsMock.mockResolvedValue([log({}, { amount: 7_000_000n })])
    expect((await resolveEvmIntent(intent(), new Set())).kind).toBe('open')
    // the same amount to the same account, just before the wallet was asked: an earlier transfer
    getLogsMock.mockResolvedValue([log({ blockNumber: 999n })])
    expect((await resolveEvmIntent(intent(), new Set([HASH.toLowerCase()]))).kind).toBe('open')
  })

  it('settles when the wallet search already follows the burn it led to', async () => {
    blockNumberMock.mockResolvedValue(2_000n)
    getLogsMock.mockResolvedValue([log()])
    expect((await resolveEvmIntent(intent(), new Set([HASH.toLowerCase()]))).kind).toBe('tracked')
  })

  it('gives up once the wallet has sent nothing for half an hour', async () => {
    blockNumberMock.mockResolvedValue(2_000n)
    getLogsMock.mockResolvedValue([])
    txCountMock.mockResolvedValue(7)
    expect((await resolveEvmIntent(intent({ startedAt: Date.now() - 40 * 60_000 }), new Set())).kind).toBe('none')
    // the wallet did send something: keep looking
    txCountMock.mockResolvedValue(8)
    expect((await resolveEvmIntent(intent({ startedAt: Date.now() - 40 * 60_000 }), new Set())).kind).toBe('open')
  })

  it('calls it unreadable only after a day of failed reads', async () => {
    blockNumberMock.mockResolvedValue(2_000n)
    getLogsMock.mockRejectedValue(new Error('Archive requests require a personal token'))
    expect((await resolveEvmIntent(intent({ startedAt: Date.now() - 25 * 3600_000 }), new Set())).kind).toBe('unreadable')
    expect((await resolveEvmIntent(intent(), new Set())).kind).toBe('open')
  })
})

const H1 = `0x${'01'.repeat(32)}` as const
const H2 = `0x${'02'.repeat(32)}` as const

describe('searchEvmWallet and searchStellarAccount', () => {
  it('asks Circle only about unsettled burns and lists the one still on its way', async () => {
    blockNumberMock.mockResolvedValue(100_000n)
    getLogsMock.mockResolvedValueOnce([log({ transactionHash: H2 }), log({ transactionHash: H1 })]).mockResolvedValue([])
    markSettled('testnet', [H1])
    irisMock.mockResolvedValue({ state: 'pending' })
    const r = await searchEvmWallet('testnet', chain, DEPOSITOR, new Set())
    expect(r.found.map((t) => t.id)).toEqual([H2])
    expect(irisMock).toHaveBeenCalledTimes(1)
    expect(r.search.complete).toBe(true)
  })

  it('lists nothing unchecked and stops asking Circle after a failure', async () => {
    blockNumberMock.mockResolvedValue(100_000n)
    const hashes = ['03', '04', '05', '06'].map((b) => `0x${b.repeat(32)}` as const)
    getLogsMock.mockResolvedValueOnce(hashes.map((h) => log({ transactionHash: h }))).mockResolvedValue([])
    // a caller Circle shuts out only sees the request fail
    irisMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const r = await searchEvmWallet('testnet', chain, DEPOSITOR, new Set())
    expect(r.found).toEqual([])
    expect(r.unchecked).toBe(4)
    expect(r.search).toMatchObject({ complete: false, error: '4 burn(s) left to check' })
    // the lookups already started finish, no new one starts
    expect(irisMock.mock.calls.length).toBeLessThanOrEqual(2)
  })

  it('marks the Stellar search incomplete when history runs past the pages read', async () => {
    const page = { records: Array.from({ length: 200 }, () => ({ type: 'payment', transaction_hash: 'x', created_at: new Date().toISOString() })), next: async () => page }
    horizonOpsMock.mockResolvedValue(page)
    expect(await searchStellarAccount('testnet', RECIPIENT, new Set())).toEqual({ found: [], complete: false })
  })

  it('leaves a Stellar burn it could not check for the next search, however recent', async () => {
    const recent = { ...op(), created_at: new Date(Date.now() - 60_000).toISOString() }
    horizonOpsMock.mockResolvedValue({ records: [recent], next: async () => ({ records: [] }) })
    irisMock.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await searchStellarAccount('testnet', RECIPIENT, new Set())).toEqual({ found: [], complete: false })
    // Circle not knowing it yet is an answer: on its way
    irisMock.mockResolvedValue({ state: 'pending' })
    const found = await searchStellarAccount('testnet', RECIPIENT, new Set())
    expect(found.found.map((t) => t.id)).toEqual(['c0ffee'])
    expect(found.complete).toBe(true)
  })
})

describe('stellarBurnFate and evmBurnFate', () => {
  it('on Stellar: taken, failed, or missing from Horizon and the RPC both', async () => {
    horizonTxMock.mockResolvedValueOnce({ successful: true })
    expect(await stellarBurnFate('testnet', 'c0ffee')).toBe('landed')
    horizonTxMock.mockResolvedValueOnce({ successful: false })
    expect(await stellarBurnFate('testnet', 'c0ffee')).toBe('failed')
    // Horizon behind the ledger: the RPC has it
    horizonTxMock.mockRejectedValue(new NotFoundError('not found', {}))
    rpcTxMock.mockResolvedValueOnce({ status: rpc.Api.GetTransactionStatus.SUCCESS })
    expect(await stellarBurnFate('testnet', 'c0ffee')).toBe('landed')
    rpcTxMock.mockResolvedValueOnce({ status: rpc.Api.GetTransactionStatus.NOT_FOUND })
    expect(await stellarBurnFate('testnet', 'c0ffee')).toBe('missing')
    // a Horizon that does not answer settles nothing
    horizonTxMock.mockRejectedValue(new Error('timeout'))
    expect(await stellarBurnFate('testnet', 'c0ffee')).toBeNull()
  })

  it('on an EVM chain: mined, reverted, not mined yet, or unreadable', async () => {
    receiptMock.mockResolvedValueOnce({ status: 'success' })
    expect(await evmBurnFate(chain, H1)).toBe('landed')
    receiptMock.mockResolvedValueOnce({ status: 'reverted' })
    expect(await evmBurnFate(chain, H1)).toBe('failed')
    receiptMock.mockRejectedValueOnce(new TransactionReceiptNotFoundError({ hash: H1 }))
    expect(await evmBurnFate(chain, H1)).toBe('missing')
    receiptMock.mockRejectedValueOnce(new Error('rate limited'))
    expect(await evmBurnFate(chain, H1)).toBeNull()
  })
})
