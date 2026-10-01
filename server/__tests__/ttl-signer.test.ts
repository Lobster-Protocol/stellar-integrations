// @vitest-environment node
import { describe, it, expect, vi } from 'vitest'
import { Account, Asset, Keypair, Networks, Operation, SorobanDataBuilder, TransactionBuilder, xdr } from '@stellar/stellar-sdk'
import { keySigner, signerFromEnv } from '../ttl-monitor/signer'

const key = Keypair.random()
const codeKey = xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: Buffer.alloc(32, 7) }))

function txFrom(source: string, op: xdr.Operation, passphrase = Networks.PUBLIC) {
  return new TransactionBuilder(new Account(source, '7'), { fee: '100', networkPassphrase: passphrase })
    .setSorobanData(new SorobanDataBuilder().setReadOnly([codeKey]).build())
    .addOperation(op)
    .setTimeout(30)
    .build()
}

const extend = () => Operation.extendFootprintTtl({ extendTo: 518_400 })

describe('keySigner', () => {
  it('pays from the account the secret belongs to', () => {
    const signer = keySigner(key.secret(), 'mainnet')
    expect(signer.sourceAddress).toBe(key.publicKey())
    expect(signer.network).toBe('mainnet')
  })

  it('signs a storage extend from its own account and changes nothing else', async () => {
    const tx = txFrom(key.publicKey(), extend())
    const out = await keySigner(key.secret(), 'mainnet').sign(tx.toXDR(), Networks.PUBLIC)
    const signed = TransactionBuilder.fromXDR(out, Networks.PUBLIC)
    expect(signed.signatures).toHaveLength(1)
    expect(key.verify(signed.hash(), signed.signatures[0].signature())).toBe(true)
    expect(signed.hash().equals(tx.hash())).toBe(true)
  })

  it('refuses a payment out of its account', async () => {
    const tx = new TransactionBuilder(new Account(key.publicKey(), '7'), { fee: '100', networkPassphrase: Networks.PUBLIC })
      .addOperation(Operation.payment({ destination: Keypair.random().publicKey(), asset: Asset.native(), amount: '1' }))
      .setTimeout(30)
      .build()
    await expect(keySigner(key.secret(), 'mainnet').sign(tx.toXDR(), Networks.PUBLIC)).rejects.toThrow(/only signs a storage extend/)
  })

  it('refuses an extend riding along with another operation', async () => {
    const tx = new TransactionBuilder(new Account(key.publicKey(), '7'), { fee: '100', networkPassphrase: Networks.PUBLIC })
      .addOperation(extend())
      .addOperation(Operation.bumpSequence({ bumpTo: '9' }))
      .setTimeout(30)
      .build()
    await expect(keySigner(key.secret(), 'mainnet').sign(tx.toXDR(), Networks.PUBLIC)).rejects.toThrow(/only signs a storage extend/)
  })

  it('refuses an extend paid by another account', async () => {
    const tx = txFrom(Keypair.random().publicKey(), extend())
    await expect(keySigner(key.secret(), 'mainnet').sign(tx.toXDR(), Networks.PUBLIC)).rejects.toThrow(/own account/)
  })

  it('refuses a fee bump around an extend', async () => {
    const inner = txFrom(key.publicKey(), extend())
    const bump = TransactionBuilder.buildFeeBumpTransaction(key.publicKey(), '200', inner, Networks.PUBLIC)
    await expect(keySigner(key.secret(), 'mainnet').sign(bump.toXDR(), Networks.PUBLIC)).rejects.toThrow(/only signs a storage extend/)
  })

  it('refuses to sign for the other network', async () => {
    const tx = txFrom(key.publicKey(), extend(), Networks.TESTNET)
    await expect(keySigner(key.secret(), 'mainnet').sign(tx.toXDR(), Networks.TESTNET)).rejects.toThrow(/another network/)
  })

  it('refuses a secret that is not one', () => {
    expect(() => keySigner('not-a-secret', 'mainnet')).toThrow()
  })
})

describe('signerFromEnv', () => {
  it('arms the mainnet loop only', () => {
    expect(signerFromEnv('mainnet', { TTL_EXTEND_SECRET: key.secret() })?.sourceAddress).toBe(key.publicKey())
    expect(signerFromEnv('testnet', { TTL_EXTEND_SECRET: key.secret() })).toBeUndefined()
    expect(signerFromEnv('mainnet', {})).toBeUndefined()
  })

  it('reports only on a bad secret, and keeps the value out of the log', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const bad = `S${'A'.repeat(55)}`
    expect(signerFromEnv('mainnet', { TTL_EXTEND_SECRET: bad })).toBeUndefined()
    expect(error).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(error.mock.calls)).not.toContain(bad)
    error.mockRestore()
  })
})
