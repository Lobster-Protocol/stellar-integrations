import { describe, it, expect, beforeEach } from 'vitest'

import {
  OUR_STATIC_ADDRESSES,
  evaluatePair,
  setPair,
  pairedFor,
  clearPair,
  ourRuntimeAddresses,
  rememberOurAddresses,
  type PairGuard,
} from '../wallet-pair'

// valid ed25519 accounts that are not Lobster's: third-party asset issuers, so
// isAccountId passes and the blocklist never matches them by accident.
const wallet = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
const multisig = 'GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2'
const other = 'GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA'
const ok: PairGuard = { ourAddresses: OUR_STATIC_ADDRESSES, ready: true }

beforeEach(() => {
  localStorage.clear()
})

describe('evaluatePair (the one rule: never pair to a Lobster address)', () => {
  it('accepts a valid account that is not ours or the wallet itself', () => {
    expect(evaluatePair(wallet, multisig, ok)).toEqual({ ok: true, address: multisig })
  })

  it('trims surrounding whitespace', () => {
    expect(evaluatePair(wallet, `  ${multisig}  `, ok)).toEqual({ ok: true, address: multisig })
  })

  it('refuses an empty entry', () => {
    expect(evaluatePair(wallet, '   ', ok)).toMatchObject({ ok: false })
  })

  it('refuses something that is not a stellar account', () => {
    expect(evaluatePair(wallet, 'not-an-address', ok)).toMatchObject({ ok: false })
    // a contract id is not an account
    expect(
      evaluatePair(wallet, 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC', ok),
    ).toMatchObject({ ok: false })
  })

  it('refuses pairing the wallet with itself', () => {
    expect(evaluatePair(wallet, wallet, ok)).toMatchObject({ ok: false })
  })

  it('refuses every Lobster address in the static floor', () => {
    expect(OUR_STATIC_ADDRESSES.length).toBeGreaterThan(0)
    for (const a of OUR_STATIC_ADDRESSES) {
      expect(evaluatePair(wallet, a, ok)).toMatchObject({ ok: false, reason: expect.stringMatching(/Lobster/) })
    }
  })

  it('refuses a runtime demo-treasury address the caller adds to the guard', () => {
    const treasury = 'GDSTRSHXHGJ7ZIVRBXEYE5Q74XUVCUSEKEBR7UCHEUUEK72N7I7KJ6JH'
    const guard: PairGuard = { ourAddresses: [...OUR_STATIC_ADDRESSES, treasury], ready: true }
    expect(evaluatePair(wallet, treasury, guard)).toMatchObject({ ok: false, reason: expect.stringMatching(/Lobster/) })
  })

  it('fails closed while the demo address is not yet confirmed', () => {
    const guard: PairGuard = { ourAddresses: OUR_STATIC_ADDRESSES, ready: false }
    expect(evaluatePair(wallet, multisig, guard)).toMatchObject({ ok: false })
  })
})

describe('pair storage', () => {
  it('saves and reads back a pair, scoped by network and wallet', () => {
    setPair('testnet', wallet, multisig, ok)
    expect(pairedFor('testnet', wallet)).toBe(multisig)
    expect(pairedFor('mainnet', wallet)).toBeNull()
    expect(pairedFor('testnet', other)).toBeNull()
  })

  it('returns null with no wallet', () => {
    expect(pairedFor('testnet', null)).toBeNull()
  })

  it('throws the verdict reason and stores nothing on a refused address', () => {
    expect(() => setPair('testnet', wallet, OUR_STATIC_ADDRESSES[0], ok)).toThrow(/Lobster/)
    expect(pairedFor('testnet', wallet)).toBeNull()
  })

  it('persists nothing when it fails closed', () => {
    const guard: PairGuard = { ourAddresses: OUR_STATIC_ADDRESSES, ready: false }
    expect(() => setPair('testnet', wallet, multisig, guard)).toThrow()
    expect(pairedFor('testnet', wallet)).toBeNull()
  })

  it('clears a saved pair', () => {
    setPair('testnet', wallet, multisig, ok)
    clearPair('testnet', wallet)
    expect(pairedFor('testnet', wallet)).toBeNull()
  })
})

describe('remembered runtime addresses (our demo treasury)', () => {
  it('remembers valid accounts and drops junk and duplicates', () => {
    rememberOurAddresses([multisig, 'nope', multisig, null, undefined])
    expect(ourRuntimeAddresses()).toEqual([multisig])
  })

  it('keeps refusing a remembered address as a pair even with no demo active', () => {
    rememberOurAddresses([multisig])
    // the caller composes the guard from the static floor plus the remembered set
    const guard: PairGuard = { ourAddresses: [...OUR_STATIC_ADDRESSES, ...ourRuntimeAddresses()], ready: true }
    expect(evaluatePair(wallet, multisig, guard)).toMatchObject({ ok: false, reason: expect.stringMatching(/Lobster/) })
  })
})
