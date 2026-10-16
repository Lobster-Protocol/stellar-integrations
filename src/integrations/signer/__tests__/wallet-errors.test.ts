import { describe, it, expect } from 'vitest'

import { walletAnswerText } from '../wallet-errors'

describe("a wallet's answer that never came", () => {
  it('says what WalletConnect giving up means, and what to do', () => {
    const text = walletAnswerText('Request expired. Please try again.')
    expect(text).toMatch(/did not answer within five minutes, so nothing was signed or sent/)
    expect(text).toMatch(/policy lets someone other than you approve/)
  })

  it('leaves any other error to the screen that shows it', () => {
    expect(walletAnswerText('User declined access')).toBeNull()
  })
})
