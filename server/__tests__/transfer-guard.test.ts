// @vitest-environment node
import { describe, it, expect } from 'vitest'

import { checkTransfer } from '../dfns/transfer'
import { SignGuardRejected } from '../dfns/sign-guard'

const TREASURY = 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU'
const OTHER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'

const cfg = {
  treasuryAddress: TREASURY,
  destinationWhitelist: [TREASURY],
  maxAmountStroops: 1_000_000n,
}

describe('checkTransfer', () => {
  it('lets a whitelisted destination through under the cap', () => {
    expect(checkTransfer({ to: TREASURY, stroops: '100000' }, cfg)).toBe(100000n)
  })

  it('refuses a destination nobody listed', () => {
    expect(() => checkTransfer({ to: OTHER, stroops: '1' }, cfg)).toThrow(SignGuardRejected)
    expect(() => checkTransfer({ to: OTHER, stroops: '1' }, cfg)).toThrow(/not in whitelist/i)
  })

  it('refuses an amount over the cap', () => {
    expect(() => checkTransfer({ to: TREASURY, stroops: '1000001' }, cfg)).toThrow(/exceeds cap/i)
  })

  it('accepts the cap exactly', () => {
    expect(checkTransfer({ to: TREASURY, stroops: '1000000' }, cfg)).toBe(1_000_000n)
  })

  it.each(['0', '-5'])('refuses a non-positive amount (%s)', (stroops) => {
    expect(() => checkTransfer({ to: TREASURY, stroops }, cfg)).toThrow(/must be positive/i)
  })

  it.each(['1.5', 'abc', ''])('refuses an amount that is not whole stroops (%s)', (stroops) => {
    expect(() => checkTransfer({ to: TREASURY, stroops }, cfg)).toThrow(/whole number of stroops/i)
  })

  it('leaves the amount alone when no cap is set, but still checks the destination', () => {
    const uncapped = { ...cfg, maxAmountStroops: 0n }
    expect(checkTransfer({ to: TREASURY, stroops: '999999999999' }, uncapped)).toBe(999999999999n)
    expect(() => checkTransfer({ to: OTHER, stroops: '1' }, uncapped)).toThrow(/not in whitelist/i)
  })
})
