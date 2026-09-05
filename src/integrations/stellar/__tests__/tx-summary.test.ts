// @vitest-environment node
// the ed25519 lib rejects jsdom's Uint8Array, and this is a pure decoder, so run
// it in node. reproduces the review's multi-source hijack: a tx whose source is
// the account under review but which carries an operation sourced from a DIFFERENT
// account, the shape that drained a separate account on-chain.
import { describe, it, expect } from 'vitest'
import {
  Account,
  TransactionBuilder,
  Operation,
  Asset,
  Contract,
  Address,
  nativeToScVal,
  Keypair,
  Networks,
  xdr,
} from '@stellar/stellar-sdk'

import { summarizeTx } from '../tx-summary'

const A = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1)).publicKey()
const P = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2)).publicKey()
const Z = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 3)).publicKey()
const CONTRACT = 'CACIPDGSEGB3C5FHINR3S5V6F7BMVH5IWVQ2U3BUHHTP4BVSRRPE2LXO'

function build(ops: xdr.Operation[]): string {
  const src = new Account(A, '10')
  const b = new TransactionBuilder(src, { fee: '1000', networkPassphrase: Networks.TESTNET })
  ops.forEach((o) => b.addOperation(o))
  return b.setTimeout(120).build().toXDR()
}

describe('transaction summary for a co-signer', () => {
  it('reads a normal contract call sourced from the account as no danger', () => {
    const s = summarizeTx(build([new Contract(CONTRACT).call('deposit')]), 'testnet', A)
    expect(s.operations).toHaveLength(1)
    expect(s.operations[0].type).toBe('invokeHostFunction')
    expect(s.operations[0].offAccount).toBe(false)
    expect(s.operations[0].danger).toBe('none')
    expect(s.operations[0].detail).toMatch(/call deposit on CACI/)
    expect(s.dangers).toHaveLength(0)
  })

  it('flags a payment sourced from a DIFFERENT account (the hijack)', () => {
    const s = summarizeTx(
      build([Operation.payment({ source: P, destination: Z, asset: Asset.native(), amount: '9000' })]),
      'testnet',
      A,
    )
    expect(s.operations[0].offAccount).toBe(true)
    expect(s.operations[0].danger).toBe('off-account')
    expect(s.dangers.some((d) => /sends from/.test(d))).toBe(true)
  })

  it('flags a hidden off-account payment buried behind a normal-looking call', () => {
    const s = summarizeTx(
      build([
        new Contract(CONTRACT).call('deposit'),
        Operation.payment({ source: P, destination: Z, asset: Asset.native(), amount: '9000' }),
      ]),
      'testnet',
      A,
    )
    expect(s.operations).toHaveLength(2)
    expect(s.operations[0].danger).toBe('none')
    expect(s.operations[1].danger).toBe('off-account')
    expect(s.dangers.length).toBeGreaterThan(0)
  })

  it('flags set_options as an account-control danger', () => {
    const s = summarizeTx(build([Operation.setOptions({ homeDomain: 'lobster.test' })]), 'testnet', A)
    expect(s.operations[0].danger).toBe('account-control')
    expect(s.dangers.some((d) => /who controls/.test(d))).toBe(true)
  })

  it('flags account_merge as emptying the account', () => {
    const s = summarizeTx(build([Operation.accountMerge({ destination: Z })]), 'testnet', A)
    expect(s.operations[0].danger).toBe('account-control')
    expect(s.dangers.some((d) => /empties/.test(d))).toBe(true)
  })

  it('describes a plain payment from the account itself', () => {
    const s = summarizeTx(
      build([Operation.payment({ destination: Z, asset: Asset.native(), amount: '5' })]),
      'testnet',
      A,
    )
    expect(s.operations[0].danger).toBe('none')
    expect(s.operations[0].detail).toMatch(/send 5(\.0+)? XLM to/)
  })

  it('decodes a direct SAC transfer to show the amount and recipient, and flags it', () => {
    const sac = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC'
    const op = new Contract(sac).call(
      'transfer',
      new Address(A).toScVal(),
      new Address(Z).toScVal(),
      nativeToScVal(9000n, { type: 'i128' }),
    )
    const s = summarizeTx(build([op]), 'testnet', A)
    expect(s.operations[0].danger).toBe('token-move')
    expect(s.operations[0].detail).toMatch(/move 9000 tokens/)
    expect(s.dangers.some((d) => /moves 9000 tokens/.test(d))).toBe(true)
  })

  it('flags a dex offer as moving value out', () => {
    const op = Operation.manageSellOffer({
      selling: Asset.native(),
      buying: new Asset('USDC', A),
      amount: '10000',
      price: '0.0000001',
    })
    const s = summarizeTx(build([op]), 'testnet', A)
    expect(s.operations[0].danger).toBe('token-move')
    expect(s.dangers.length).toBeGreaterThan(0)
  })
})
