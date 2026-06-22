// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Account, xdr } from '@stellar/stellar-sdk'
import { extendKeys, type ExtendSigner } from '../ttl-monitor/index'
import { readTtl } from '../ttl-monitor/ledger'

// real TransactionBuilder so buildExtendTtlTx builds a genuine tx, fake static
// fromXDR so the signed leg doesn't have to round-trip a real envelope. the
// sim classifiers follow the same field convention as builder.test.ts.
vi.mock('@stellar/stellar-sdk', async () => {
  const actual = await vi.importActual<typeof import('@stellar/stellar-sdk')>('@stellar/stellar-sdk')
  class TB extends actual.TransactionBuilder {
    static fromXDR(envelope: string) {
      return { signed: envelope } as never
    }
  }
  return {
    ...actual,
    TransactionBuilder: TB,
    rpc: {
      ...actual.rpc,
      Api: {
        ...actual.rpc.Api,
        isSimulationError: (s: { error?: string }) => 'error' in s && !!s.error,
        isSimulationRestore: (s: { restorePreamble?: unknown }) => !!s.restorePreamble,
      },
      assembleTransaction: () => ({ build: () => ({ toXDR: () => 'ASSEMBLED_EXTEND', fee: '1000' }) }),
    },
  }
})

const SOURCE = 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU'

// a real ledger key, since extendKeys parses keyXdr back from base64
const KEY_B64 = xdr.LedgerKey.contractCode(
  new xdr.LedgerKeyContractCode({ hash: Buffer.from('ab'.repeat(32), 'hex') }),
).toXDR('base64')
const critStatus = { keyXdr: KEY_B64, reading: readTtl(1_000_010, 1_000_000) }

function makeServer(over: Record<string, unknown> = {}) {
  return {
    getAccount: vi.fn(async () => new Account(SOURCE, '1')),
    simulateTransaction: vi.fn(async () => ({ result: {}, minResourceFee: '500' })),
    sendTransaction: vi.fn(async () => ({ status: 'PENDING', hash: 'HASH' })),
    pollTransaction: vi.fn(async () => ({ status: 'SUCCESS' })),
    ...over,
  }
}

function makeSigner(): ExtendSigner {
  return {
    sourceAddress: SOURCE,
    network: 'testnet',
    sign: vi.fn(async (xdrBase64: string) => `SIGNED:${xdrBase64}`),
  }
}

describe('extendKeys', () => {
  beforeEach(() => vi.clearAllMocks())

  it('simulates, signs the assembled xdr and submits on the happy path', async () => {
    const server = makeServer()
    const signer = makeSigner()
    await extendKeys(server as never, [critStatus], 'testnet', signer)
    expect(signer.sign).toHaveBeenCalledWith('ASSEMBLED_EXTEND', expect.stringContaining('Test'))
    expect(server.sendTransaction).toHaveBeenCalledTimes(1)
    expect(server.pollTransaction).toHaveBeenCalledWith('HASH')
  })

  it('never signs a key that archived between the scan and the extend', async () => {
    const server = makeServer({
      simulateTransaction: vi.fn(async () => ({ restorePreamble: {} })),
    })
    const signer = makeSigner()
    await extendKeys(server as never, [critStatus], 'testnet', signer)
    expect(signer.sign).not.toHaveBeenCalled()
    expect(server.sendTransaction).not.toHaveBeenCalled()
  })

  it('logs a failed key and still extends the rest', async () => {
    const server = makeServer({
      simulateTransaction: vi
        .fn()
        .mockResolvedValueOnce({ error: 'guest panic' })
        .mockResolvedValueOnce({ result: {}, minResourceFee: '500' }),
    })
    const signer = makeSigner()
    await extendKeys(server as never, [critStatus, critStatus], 'testnet', signer)
    expect(signer.sign).toHaveBeenCalledTimes(1)
    expect(server.sendTransaction).toHaveBeenCalledTimes(1)
  })

  it('refuses to sign when the signer is wired for the other network', async () => {
    const server = makeServer()
    const signer = makeSigner() // network: 'testnet'
    await expect(extendKeys(server as never, [critStatus], 'mainnet', signer)).rejects.toThrow(/wired for testnet/)
    expect(signer.sign).not.toHaveBeenCalled()
  })

  it('skips a key whose assembled fee blows past the cap', async () => {
    const server = makeServer()
    const signer = makeSigner()
    await extendKeys(server as never, [critStatus], 'testnet', signer, 100n)
    expect(signer.sign).not.toHaveBeenCalled()
    expect(server.sendTransaction).not.toHaveBeenCalled()
  })
})
