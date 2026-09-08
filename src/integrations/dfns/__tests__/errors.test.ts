import { describe, it, expect } from 'vitest'

import { readableDfnsError } from '../errors'

describe('readableDfnsError', () => {
  it('maps txMalformed to network/soroban guidance', () => {
    expect(readableDfnsError('dfns sign 500: txMalformed')).toMatch(/different network|WalletConnect/i)
  })

  it('maps a bad sequence', () => {
    expect(readableDfnsError('tx_bad_seq')).toMatch(/moved on|again/i)
  })

  it('maps an expired tx', () => {
    expect(readableDfnsError('op result tx_too_late')).toMatch(/expired|again/i)
  })

  it('maps a low fee', () => {
    expect(readableDfnsError('tx_insufficient_fee')).toMatch(/fee was too low/i)
  })

  it('maps a policy rejection', () => {
    expect(readableDfnsError('Rejected by policy')).toMatch(/policy/i)
  })

  it('passes an unfunded message through unchanged', () => {
    const msg = 'This wallet is not funded on testnet yet. Add some XLM (use friendbot on testnet) first.'
    expect(readableDfnsError(msg)).toBe(msg)
  })

  it('keeps only the first line of a blob', () => {
    const out = readableDfnsError('boom\n{"a":1}\nmore')
    expect(out).toBe('boom')
  })
})
