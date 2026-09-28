import { describe, it, expect, vi, beforeEach } from 'vitest'

const { signTransactionMock, getNetworkMock } = vi.hoisted(() => ({ signTransactionMock: vi.fn(), getNetworkMock: vi.fn() }))

vi.mock('@creit-tech/stellar-wallets-kit', () => ({
  StellarWalletsKit: { signTransaction: signTransactionMock, getNetwork: getNetworkMock },
}))

import { walletKitSigner } from '../wallet-kit-signer'

const PASSPHRASE = 'Test SDF Network ; September 2015'
const ACCOUNT = 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU'

beforeEach(() => {
  signTransactionMock.mockReset()
  getNetworkMock.mockReset()
  getNetworkMock.mockResolvedValue({ network: 'TESTNET', networkPassphrase: PASSPHRASE })
})

describe('walletKitSigner', () => {
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

  it.each([
    ['a { code, message } object', { code: -4, message: 'The user rejected this request.' }, 'The user rejected this request.'],
    ['a bare string', 'User declined access', 'User declined access'],
    ['something with no message', { code: -1 }, 'The wallet did not sign'],
  ])('turns %s from the kit into an Error', async (_label, rejection, message) => {
    signTransactionMock.mockRejectedValueOnce(rejection)
    const err = await walletKitSigner
      .signTransaction('RAW', { networkPassphrase: PASSPHRASE, address: ACCOUNT })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toBe(message)
  })

  it('says the wallet is on the other network instead of asking it to sign', async () => {
    getNetworkMock.mockResolvedValueOnce({ network: 'PUBLIC', networkPassphrase: 'Public Global Stellar Network ; September 2015' })
    await expect(
      walletKitSigner.signTransaction('RAW', { networkPassphrase: PASSPHRASE, address: ACCOUNT }),
    ).rejects.toThrow('Your Stellar wallet is on Mainnet and this page is on Testnet. Switch the wallet to Testnet, then try again.')
    expect(signTransactionMock).not.toHaveBeenCalled()
  })

  it('still signs with a wallet that cannot say which network it is on', async () => {
    getNetworkMock.mockRejectedValueOnce({ code: -3, message: 'not supported' })
    signTransactionMock.mockResolvedValueOnce({ signedTxXdr: 'SIGNED' })
    const r = await walletKitSigner.signTransaction('RAW', { networkPassphrase: PASSPHRASE, address: ACCOUNT })
    expect(r).toEqual({ signedTxXdr: 'SIGNED' })
  })
})
