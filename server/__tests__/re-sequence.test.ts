// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  TransactionBuilder,
  Networks,
  Account,
  BASE_FEE,
  Operation,
  Asset,
  Contract,
  SorobanDataBuilder,
} from '@stellar/stellar-sdk'

import { rebuildWithSequence } from '../dfns/resequence'

const TREASURY = 'GCWEI7HVEOPEMP7YTULFH5DMGCJCHMEKZHBHTI3R66WMKX276A4W2OPB'
const LOBS_ISSUER = 'GBYIQEC7OMW2BV4PFL4R6GCBN32ALIEAEYDV7MIWPRGJGEP5M7UMWVCB'

function trustlineAt(seq: string) {
  return new TransactionBuilder(new Account(TREASURY, seq), {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.changeTrust({ asset: new Asset('LOBS', LOBS_ISSUER) }))
    .setTimeout(3600)
    .build()
}

describe('rebuildWithSequence', () => {
  it('rebinds the sequence to the fresh account, one past its current value', () => {
    // the client built this against a now-stale sequence (100 -> tx seq 101)
    const stale = trustlineAt('100')
    expect(stale.sequence).toBe('101')
    // the account has since moved to 999
    const fresh = rebuildWithSequence(stale, new Account(TREASURY, '999'), Networks.TESTNET)
    expect(fresh.sequence).toBe('1000')
  })

  it('preserves source, fee, ops and time bounds', () => {
    const stale = trustlineAt('100')
    const fresh = rebuildWithSequence(stale, new Account(TREASURY, '5'), Networks.TESTNET)
    expect(fresh.source).toBe(TREASURY)
    expect(fresh.fee).toBe(stale.fee)
    expect(fresh.operations).toHaveLength(1)
    expect(fresh.operations[0].type).toBe('changeTrust')
    expect(fresh.timeBounds).toEqual(stale.timeBounds)
  })

  it('keeps a payment op intact', () => {
    const stale = new TransactionBuilder(new Account(TREASURY, '100'), {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.payment({ destination: TREASURY, asset: Asset.native(), amount: '0.0100000' }))
      .setTimeout(3600)
      .build()
    const fresh = rebuildWithSequence(stale, new Account(TREASURY, '42'), Networks.TESTNET)
    expect(fresh.sequence).toBe('43')
    const op = fresh.operations[0] as { type: string; destination?: string; amount?: string }
    expect(op.type).toBe('payment')
    expect(op.destination).toBe(TREASURY)
    expect(op.amount).toBe('0.0100000')
  })
})

// a soroban call held for approval used to come back from the rebuild with no
// footprint at all, and the network turned it down as malformed. these pin both
// halves: the resources survive, and the fee that already covered them does not
// get charged twice.
describe('rebuildWithSequence on a soroban envelope', () => {
  const FACTORY = 'CACIPDGSEGB3C5FHINR3S5V6F7BMVH5IWVQ2U3BUHHTP4BVSRRPE2LXO'
  const RESOURCE_FEE = 13211

  function sorobanCallAt(seq: string) {
    return new TransactionBuilder(new Account(TREASURY, seq), {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(new Contract(FACTORY).call('get_admin'))
      .setSorobanData(new SorobanDataBuilder().setResourceFee(RESOURCE_FEE).build())
      .setTimeout(120)
      .build()
  }

  function footprintOf(tx: ReturnType<typeof sorobanCallAt>) {
    const ext = tx.toEnvelope().v1().tx().ext()
    return ext.switch() === 1 ? ext.sorobanData() : null
  }

  it('carries the footprint across instead of dropping it', () => {
    const built = sorobanCallAt('100')
    expect(footprintOf(built)).not.toBeNull()

    const fresh = rebuildWithSequence(built, new Account(TREASURY, '999'), Networks.TESTNET)
    expect(footprintOf(fresh)).not.toBeNull()
  })

  it('keeps the resource budget the simulation worked out', () => {
    const fresh = rebuildWithSequence(
      sorobanCallAt('100'),
      new Account(TREASURY, '999'),
      Networks.TESTNET,
    )
    expect(footprintOf(fresh)!.resourceFee().toString()).toBe(String(RESOURCE_FEE))
  })

  it('does not charge the resource fee a second time', () => {
    const built = sorobanCallAt('100')
    expect(built.fee).toBe(String(Number(BASE_FEE) + RESOURCE_FEE))

    const fresh = rebuildWithSequence(built, new Account(TREASURY, '999'), Networks.TESTNET)
    expect(fresh.fee).toBe(built.fee)
  })

  it('still rebinds the sequence', () => {
    const fresh = rebuildWithSequence(
      sorobanCallAt('100'),
      new Account(TREASURY, '999'),
      Networks.TESTNET,
    )
    expect(fresh.sequence).toBe('1000')
  })
})
