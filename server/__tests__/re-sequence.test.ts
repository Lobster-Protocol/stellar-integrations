// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { TransactionBuilder, Networks, Account, BASE_FEE, Operation, Asset } from '@stellar/stellar-sdk'

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
