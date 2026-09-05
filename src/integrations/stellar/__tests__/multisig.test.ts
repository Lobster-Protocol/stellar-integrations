// @vitest-environment node
// the ed25519 lib rejects jsdom's Uint8Array, and nothing here needs a dom, so
// run it in node like the server tests do.
import { describe, it, expect } from 'vitest'
import { Account, TransactionBuilder, Operation, Keypair, Networks } from '@stellar/stellar-sdk'

import {
  isMultisig,
  requiredWeight,
  signedBy,
  accumulatedWeight,
  hasEnoughWeight,
  combine,
  type AccountSigning,
} from '../multisig'

// deterministic seeds instead of Keypair.random(): the jsdom test env has no
// randomBytes source the ed25519 lib accepts, and fixed keys make the test
// reproducible anyway.
const kpA = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1))
const kpB = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 2))
const kpC = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 3))

// a 2-of-2: master A weight 1, co-signer B weight 1, medium threshold 2, so no
// single signer clears a value action on its own.
const twoOfTwo: AccountSigning = {
  accountId: kpA.publicKey(),
  masterWeight: 1,
  signers: [
    { key: kpA.publicKey(), weight: 1 },
    { key: kpB.publicKey(), weight: 1 },
  ],
  thresholds: { low: 0, med: 2, high: 2 },
}

// a normal single-sig account: one master key, default zero thresholds.
const singleSig: AccountSigning = {
  accountId: kpA.publicKey(),
  masterWeight: 1,
  signers: [{ key: kpA.publicKey(), weight: 1 }],
  thresholds: { low: 0, med: 0, high: 0 },
}

function buildTx(): string {
  const source = new Account(kpA.publicKey(), '42')
  const tx = new TransactionBuilder(source, { fee: '100', networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.bumpSequence({ bumpTo: '0' }))
    .setTimeout(300)
    .build()
  return tx.toXDR()
}

// signs an xdr with a keypair the way a second wallet would: parse, add one
// signature, re-serialize. this is the paste-between-signers path.
function coSign(xdr: string, kp: Keypair): string {
  const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET)
  tx.sign(kp)
  return tx.toXDR()
}

describe('multisig thresholds', () => {
  it('reads a zero threshold as needing one signature', () => {
    expect(requiredWeight(singleSig, 'med')).toBe(1)
    expect(requiredWeight(twoOfTwo, 'med')).toBe(2)
    expect(requiredWeight(twoOfTwo, 'high')).toBe(2)
  })

  it('flags an account multisig only when no single signer clears medium', () => {
    expect(isMultisig(singleSig)).toBe(false)
    expect(isMultisig(twoOfTwo)).toBe(true)
  })

  it('does not flag multisig when a co-signer exists but thresholds stay open', () => {
    const cosignerButOpen: AccountSigning = {
      ...twoOfTwo,
      thresholds: { low: 0, med: 0, high: 0 },
    }
    expect(isMultisig(cosignerButOpen)).toBe(false)
  })
})

describe('accumulated signing weight', () => {
  it('counts nothing before anyone signs', () => {
    const xdr = buildTx()
    expect(signedBy(xdr, 'testnet', twoOfTwo)).toEqual([])
    expect(accumulatedWeight(xdr, 'testnet', twoOfTwo)).toBe(0)
    expect(hasEnoughWeight(xdr, 'testnet', twoOfTwo)).toBe(false)
  })

  it('counts one signer but still falls short of a 2-of-2', () => {
    const xdr = coSign(buildTx(), kpA)
    expect(signedBy(xdr, 'testnet', twoOfTwo)).toEqual([kpA.publicKey()])
    expect(accumulatedWeight(xdr, 'testnet', twoOfTwo)).toBe(1)
    expect(hasEnoughWeight(xdr, 'testnet', twoOfTwo)).toBe(false)
  })

  it('clears the quorum once both signers have signed the same envelope', () => {
    const xdr = coSign(coSign(buildTx(), kpA), kpB)
    expect(signedBy(xdr, 'testnet', twoOfTwo).sort()).toEqual([kpA.publicKey(), kpB.publicKey()].sort())
    expect(accumulatedWeight(xdr, 'testnet', twoOfTwo)).toBe(2)
    expect(hasEnoughWeight(xdr, 'testnet', twoOfTwo)).toBe(true)
  })

  it('ignores a signature from a key that is not a signer on the account', () => {
    const xdr = coSign(coSign(buildTx(), kpA), kpC)
    expect(signedBy(xdr, 'testnet', twoOfTwo)).toEqual([kpA.publicKey()])
    expect(accumulatedWeight(xdr, 'testnet', twoOfTwo)).toBe(1)
    expect(hasEnoughWeight(xdr, 'testnet', twoOfTwo)).toBe(false)
  })

  it('single-sig account clears on the master signature alone', () => {
    const xdr = coSign(buildTx(), kpA)
    expect(hasEnoughWeight(xdr, 'testnet', singleSig)).toBe(true)
  })
})

describe('combining independent signatures', () => {
  it('merges each signer signed the same base into one envelope', () => {
    const base = buildTx()
    const signedA = coSign(base, kpA)
    const signedB = coSign(base, kpB)
    const withA = combine(base, signedA, 'testnet', twoOfTwo)
    expect(accumulatedWeight(withA, 'testnet', twoOfTwo)).toBe(1)
    const withAB = combine(withA, signedB, 'testnet', twoOfTwo)
    expect(accumulatedWeight(withAB, 'testnet', twoOfTwo)).toBe(2)
    expect(hasEnoughWeight(withAB, 'testnet', twoOfTwo)).toBe(true)
  })

  it('drops a signature from a key the account does not know', () => {
    const base = buildTx()
    const signedC = coSign(base, kpC)
    expect(accumulatedWeight(combine(base, signedC, 'testnet', twoOfTwo), 'testnet', twoOfTwo)).toBe(0)
  })

  it('does not double count the same signature', () => {
    const base = buildTx()
    const signedA = coSign(base, kpA)
    const once = combine(base, signedA, 'testnet', twoOfTwo)
    const twice = combine(once, signedA, 'testnet', twoOfTwo)
    expect(accumulatedWeight(twice, 'testnet', twoOfTwo)).toBe(1)
  })
})
