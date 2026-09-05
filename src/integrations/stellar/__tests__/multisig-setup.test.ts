// @vitest-environment node
// buildSetOptionsTx reads the account from Horizon, so stub that one call and
// build offline, then read back the operations. proves the shipped setup path
// shapes the signers and thresholds the way the on-chain proof relied on.
import { describe, it, expect, vi } from 'vitest'
import { TransactionBuilder, Keypair, Networks } from '@stellar/stellar-sdk'

vi.mock('../../horizon/client', () => ({
  getHorizonServer: () => ({
    loadAccount: async (id: string) => ({
      accountId: () => id,
      sequenceNumber: () => '10',
      incrementSequenceNumber: () => {},
    }),
  }),
}))

import { buildSetOptionsTx } from '../multisig'

const owner = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 10)).publicKey()
const coA = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 11)).publicKey()
const coB = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 12)).publicKey()

interface SetOp {
  type: string
  signer?: { ed25519PublicKey?: string; weight?: number }
  masterWeight?: number
  lowThreshold?: number
  medThreshold?: number
  highThreshold?: number
}

function ops(xdr: string): SetOp[] {
  return TransactionBuilder.fromXDR(xdr, Networks.TESTNET).operations as unknown as SetOp[]
}

describe('building the set_options tx', () => {
  it('makes a 2-of-2: one op adds the co-signer and sets the thresholds to 2', async () => {
    const xdr = await buildSetOptionsTx('testnet', owner, {
      addSigners: [{ key: coA, weight: 1 }],
      masterWeight: 1,
      threshold: 2,
    })
    const o = ops(xdr)
    expect(o).toHaveLength(1)
    expect(o[0].type).toBe('setOptions')
    expect(o[0].signer).toMatchObject({ ed25519PublicKey: coA, weight: 1 })
    expect(o[0].masterWeight).toBe(1)
    expect(o[0].lowThreshold).toBe(2)
    expect(o[0].medThreshold).toBe(2)
    expect(o[0].highThreshold).toBe(2)
  })

  it('makes a 2-of-3: two ops add the signers, only the last sets thresholds', async () => {
    const xdr = await buildSetOptionsTx('testnet', owner, {
      addSigners: [
        { key: coA, weight: 1 },
        { key: coB, weight: 1 },
      ],
      masterWeight: 1,
      threshold: 2,
    })
    const o = ops(xdr)
    expect(o).toHaveLength(2)
    expect(o[0].signer).toMatchObject({ ed25519PublicKey: coA, weight: 1 })
    expect(o[0].medThreshold).toBeUndefined()
    expect(o[1].signer).toMatchObject({ ed25519PublicKey: coB, weight: 1 })
    expect(o[1].medThreshold).toBe(2)
    // governance needs more than a spend: high is the full weight (3), above med (2)
    expect(o[1].highThreshold).toBe(3)
  })

  it('keeps the spend threshold on low and med, governance on high', async () => {
    const xdr = await buildSetOptionsTx('testnet', owner, {
      addSigners: [
        { key: coA, weight: 1 },
        { key: coB, weight: 1 },
      ],
      masterWeight: 1,
      threshold: 2,
    })
    const last = ops(xdr).at(-1)!
    expect(last.lowThreshold).toBe(2)
    expect(last.medThreshold).toBe(2)
    expect(last.highThreshold).toBeGreaterThan(last.medThreshold!)
  })
})
