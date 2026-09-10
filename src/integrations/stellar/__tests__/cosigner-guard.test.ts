import { describe, it, expect, beforeEach } from 'vitest'

import {
  OUR_STATIC_ADDRESSES,
  coSignerProblem,
  ourAddresses,
  ourRuntimeAddresses,
  rememberOurAddress,
} from '../cosigner-guard'

// the demo wallet and the dfns testnet treasury, the exact pair that froze an
// account when the treasury was typed in as a co-signer
const WALLET = 'GCVFDROZF3D565FAURFQBXQEOHT4BPQK2P66JUCL5XQWNWQBOGXMRVQA'
const TREASURY = 'GCWEI7HVEOPEMP7YTULFH5DMGCJCHMEKZHBHTI3R66WMKX276A4W2OPB'
const STRANGER = 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU'

describe('coSignerProblem', () => {
  const none: string[] = []

  it('lets an ordinary account through', () => {
    expect(coSignerProblem(WALLET, STRANGER, none)).toBeNull()
  })

  it('says nothing while the field is still empty', () => {
    expect(coSignerProblem(WALLET, '', none)).toBeNull()
    expect(coSignerProblem(WALLET, '   ', none)).toBeNull()
  })

  it('turns down something that is not an account address', () => {
    expect(coSignerProblem(WALLET, 'not an address', none)).toMatch(/not a Stellar account/i)
    expect(coSignerProblem(WALLET, WALLET.toLowerCase(), none)).toMatch(/not a Stellar account/i)
  })

  it('turns down a contract address', () => {
    expect(
      coSignerProblem(WALLET, 'CACIPDGSEGB3C5FHINR3S5V6F7BMVH5IWVQ2U3BUHHTP4BVSRRPE2LXO', none),
    ).toMatch(/not a Stellar account/i)
  })

  it('turns down the wallet that is already signing', () => {
    expect(coSignerProblem(WALLET, WALLET, none)).toMatch(/already signing with/i)
  })

  it('turns down one of our own addresses, and says why', () => {
    const msg = coSignerProblem(WALLET, TREASURY, [TREASURY])
    expect(msg).toMatch(/Lobster address/i)
    expect(msg, 'the reader has to learn it would freeze the account').toMatch(/stuck|quorum/i)
  })

  it('does not blame an address just because it looks like ours', () => {
    expect(coSignerProblem(WALLET, STRANGER, [TREASURY])).toBeNull()
  })
})

describe('ourAddresses', () => {
  beforeEach(() => localStorage.clear())

  it('always carries the addresses the build knows about', () => {
    expect(OUR_STATIC_ADDRESSES.length).toBeGreaterThan(0)
    for (const a of OUR_STATIC_ADDRESSES) expect(ourAddresses()).toContain(a)
  })

  it('takes an address handed to it at call time', () => {
    expect(ourAddresses([TREASURY])).toContain(TREASURY)
  })

  it('ignores an empty or malformed extra', () => {
    const out = ourAddresses([null, undefined, '', 'nope'])
    expect(out).toEqual(OUR_STATIC_ADDRESSES)
  })
})

describe('rememberOurAddress', () => {
  beforeEach(() => localStorage.clear())

  it('keeps a treasury it was told about, so it stays refused later', () => {
    rememberOurAddress(TREASURY)
    expect(ourRuntimeAddresses()).toEqual([TREASURY])
    // and it is refused on a later visit with no profile connected to ask
    expect(coSignerProblem(WALLET, TREASURY, ourAddresses())).toMatch(/Lobster address/i)
  })

  it('does not store the same one twice', () => {
    rememberOurAddress(TREASURY)
    rememberOurAddress(TREASURY)
    expect(ourRuntimeAddresses()).toHaveLength(1)
  })

  it('refuses to store something that is not an account', () => {
    rememberOurAddress('nope')
    rememberOurAddress(null)
    expect(ourRuntimeAddresses()).toEqual([])
  })

  it('survives a stored value it cannot read', () => {
    localStorage.setItem('lob_our_dfns_addrs', 'not json')
    expect(ourRuntimeAddresses()).toEqual([])
    rememberOurAddress(TREASURY)
    expect(ourRuntimeAddresses()).toEqual([TREASURY])
  })
})
