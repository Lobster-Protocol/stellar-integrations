import { describe, it, expect, vi, beforeEach } from 'vitest'

const { signTransactionMock } = vi.hoisted(() => ({ signTransactionMock: vi.fn() }))

vi.mock('@creit-tech/stellar-wallets-kit', () => ({
  StellarWalletsKit: { signTransaction: signTransactionMock },
}))

import { walletKitSigner } from '../wallet-kit-signer'

const PASSPHRASE = 'Test SDF Network ; September 2015'
const ACCOUNT = 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU'

beforeEach(() => {
  signTransactionMock.mockReset()
})

describe('walletKitSigner', () => {
  it('reports name as wallet-kit', () => {
    expect(walletKitSigner.name).toBe('wallet-kit')
  })

  it('forwards xdr and opts to the wallet kit and returns the signed envelope', async () => {
    signTransactionMock.mockResolvedValueOnce({ signedTxXdr: 'SIGNED' })
    const r = await walletKitSigner.signTransaction('RAW', {
      networkPassphrase: PASSPHRASE,
      address: ACCOUNT,
    })
    expect(signTransactionMock).toHaveBeenCalledWith('RAW', {
      networkPassphrase: PASSPHRASE,
      address: ACCOUNT,
    })
    expect(r).toEqual({ signedTxXdr: 'SIGNED' })
  })

  it('propagates rejection unchanged', async () => {
    signTransactionMock.mockRejectedValueOnce(new Error('user denied'))
    await expect(
      walletKitSigner.signTransaction('RAW', { networkPassphrase: PASSPHRASE, address: ACCOUNT }),
    ).rejects.toThrow('user denied')
  })
})
