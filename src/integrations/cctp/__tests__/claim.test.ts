import { describe, it, expect } from 'vitest'

import { explainClaimFailure, checkClaim } from '../claim'
import { CctpMessageError } from '../message'

describe('explainClaimFailure', () => {
  it('says a spent nonce means the money already arrived', () => {
    expect(explainClaimFailure('HostError: Error(Contract, #6908)')).toMatch(/already delivered/)
  })

  it('points at the attestation when a signature does not verify', () => {
    // 6013 is what a malformed signature produces, seen on a mainnet simulation
    expect(explainClaimFailure('HostError: Error(Contract, #6013)\nEvent log...')).toMatch(
      /attestation again/,
    )
    expect(explainClaimFailure('HostError: Error(Contract, #6002)')).toMatch(/did not verify/)
  })

  it('shows anything else as it came, first line only', () => {
    expect(explainClaimFailure('HostError: Error(Budget, ExceededLimit)\nlong log')).toBe(
      'Stellar would reject the delivery: HostError: Error(Budget, ExceededLimit)',
    )
  })
})

describe('checkClaim refuses a foreign message before any network call', () => {
  // the head of a real Base to Stellar message, with a body too short to be a burn
  it('throws on a message too short to be a transfer', async () => {
    await expect(
      checkClaim('testnet', '0x00000001000000060000001b', '0x' + 'ab'.repeat(130), 'G'),
    ).rejects.toThrow(CctpMessageError)
  })
})
