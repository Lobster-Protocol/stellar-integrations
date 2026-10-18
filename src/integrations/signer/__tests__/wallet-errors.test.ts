import { describe, it, expect } from 'vitest'

import { walletAnswerText } from '../wallet-errors'

describe('walletAnswerText', () => {
  it('explains an expired WalletConnect request', () => {
    const text = walletAnswerText('Request expired. Please try again.')
    expect(text).toMatch(/did not answer within five minutes, so nothing was signed or sent/)
    expect(text).toMatch(/policy lets someone other than you approve/)
  })

  it('returns null for any other error', () => {
    expect(walletAnswerText('User declined access')).toBeNull()
  })
})
