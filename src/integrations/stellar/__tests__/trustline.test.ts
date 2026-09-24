import { describe, it, expect, vi } from 'vitest'
import { Account, Transaction, TransactionBuilder, Networks } from '@stellar/stellar-sdk'

const loadAccount = vi.fn()
const submitTransaction = vi.fn(async () => ({ hash: 'deadbeef' }))

vi.mock('../../horizon/client', () => ({
  getHorizonServer: () => ({ loadAccount, submitTransaction }),
}))

const { buildTrustlineXdr, submitTrustlineTx } = await import('../trustline')

const ACCOUNT = 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU'
const USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'

describe('buildTrustlineXdr', () => {
  it('builds a changeTrust tx for USDC from the destination account', async () => {
    loadAccount.mockResolvedValueOnce(new Account(ACCOUNT, '100'))
    const xdr = await buildTrustlineXdr(ACCOUNT, 'USDC', USDC_ISSUER, 'mainnet')

    const tx = TransactionBuilder.fromXDR(xdr, Networks.PUBLIC) as Transaction
    expect(tx.source).toBe(ACCOUNT)
    expect(tx.operations).toHaveLength(1)
    expect(tx.operations[0].type).toBe('changeTrust')
  })
})

describe('submitTrustlineTx', () => {
  it('submits the signed xdr to Horizon and returns the hash', async () => {
    loadAccount.mockResolvedValueOnce(new Account(ACCOUNT, '100'))
    const xdr = await buildTrustlineXdr(ACCOUNT, 'USDC', USDC_ISSUER, 'mainnet')

    const hash = await submitTrustlineTx(xdr, 'mainnet')
    expect(submitTransaction).toHaveBeenCalledTimes(1)
    expect(hash).toBe('deadbeef')
  })
})
