import { describe, it, expect } from 'vitest'
import { WALLET_CONNECT_ID } from '@creit-tech/stellar-wallets-kit/modules/wallet-connect'

import { overWalletConnect, validitySecs } from '../validity'

describe('how long a transaction stays valid', () => {
  it('gives a quorum, or the DFNS relay, an hour to collect its approvals', () => {
    expect(validitySecs({ quorum: true, walletId: 'freighter' })).toBe(3600)
    expect(validitySecs({ quorum: true, walletId: WALLET_CONNECT_ID })).toBe(3600)
  })

  it('outlives the five minutes WalletConnect waits for a wallet that holds it for an approval', () => {
    expect(validitySecs({ quorum: false, walletId: WALLET_CONNECT_ID })).toBeGreaterThan(5 * 60)
    expect(overWalletConnect(WALLET_CONNECT_ID)).toBe(true)
  })

  it('keeps a minute for a wallet that signs at once', () => {
    expect(validitySecs({ quorum: false, walletId: 'freighter' })).toBe(60)
    expect(validitySecs({ quorum: false, walletId: null })).toBe(60)
    expect(overWalletConnect('freighter')).toBe(false)
  })
})
