// @vitest-environment node
import { describe, it, expect } from 'vitest'
import {
  TransactionBuilder,
  Networks,
  Account,
  BASE_FEE,
  Operation,
  Asset,
} from '@stellar/stellar-sdk'

import { envelopeFromSignedData } from '../dfns/sign'

function buildSampleTx() {
  const source = new Account('GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU', '12345')
  return new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(
      Operation.payment({
        destination: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        asset: Asset.native(),
        amount: '1',
      }),
    )
    .setTimeout(60)
    .build()
}

describe('envelopeFromSignedData', () => {
  it('round-trips an xdr envelope through hex with 0x prefix', () => {
    const tx = buildSampleTx()
    const hex = `0x${tx.toEnvelope().toXDR('hex')}`
    const back = envelopeFromSignedData(hex, Networks.TESTNET)
    expect(back.toXDR()).toBe(tx.toXDR())
  })

  it('accepts the hex form without the 0x prefix', () => {
    const tx = buildSampleTx()
    const hex = tx.toEnvelope().toXDR('hex')
    const back = envelopeFromSignedData(hex, Networks.TESTNET)
    expect(back.toXDR()).toBe(tx.toXDR())
  })

  it('produces a tx tied to the passphrase passed in', () => {
    const tx = buildSampleTx()
    const hex = tx.toEnvelope().toXDR('hex')
    const onTestnet = envelopeFromSignedData(hex, Networks.TESTNET)
    expect(onTestnet.networkPassphrase).toBe(Networks.TESTNET)
  })
})
