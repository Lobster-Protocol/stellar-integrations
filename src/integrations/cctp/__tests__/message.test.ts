import { describe, it, expect } from 'vitest'

import {
  encodeForwardHook,
  decodeForwardHook,
  contractToBytes32,
  bytes32ToContract,
  hookToHex,
  ForwardHookError,
} from '../hook'
import {
  decodeCctpMessage,
  hexToBytes,
  amountToLand,
  recipientOf,
  assertMessageMatches,
  assertAttestation,
  CctpMessageError,
} from '../message'
import { STELLAR_CCTP_DOMAIN, CONTRACTS } from '../../../config/contracts'

// A real Base to Stellar transfer on mainnet, stellar tx e6db1c51...b778. The
// round-trip tests would agree with themselves on a wrong layout; this won't.
const REAL_MESSAGE =
  '00000001000000060000001be70efeb915fb9ae3e3ba0df06a6aaceb145d350fff37eabbf1e6cee6f88d01f7' +
  '00000000000000000000000028b5a0e9c621a5badaa536219b3a228c8168cf5d' +
  '09a3773ffd1ff361f8315d629adf17d3e4730fd00a6900715431ed4b142aded2' +
  '72bd20ff2f8281801bb05b7c29179026933256fabafeb13e94efd8ddbcfcf291' +
  '000003e8000003e8' +
  '00000001' +
  '000000000000000000000000833589fcd6edb6e08f4c7c32d4f71b54bda02913' +
  '72bd20ff2f8281801bb05b7c29179026933256fabafeb13e94efd8ddbcfcf291' +
  '0000000000000000000000000000000000000000000000000000000004c16858' +
  '000000000000000000000000ea258496a9311ffe29cdf920ca0e8bb4b41c9f04' +
  '000000000000000000000000000000000000000000000000000000000000309d' +
  '0000000000000000000000000000000000000000000000000000000000002883' +
  '0000000000000000000000000000000000000000000000000000000003d9a2ab' +
  '0000000000000000000000000000000000000000000000000000000000000038' +
  '47414d4e413251364e545a5355424c4d45584c544958594f5245374f584a4a424d454749583754324f5844414b49413743434b4e34524a56'

const REAL_RECIPIENT = 'GAMNA2Q6NTZSUBLMEXLTIXYORE7OXJJBMEGIX7T2OXDAKIA7CCKN4RJV'
const MAINNET_FORWARDER = CONTRACTS.mainnet.cctp.forwarder

describe('forward hook encoding', () => {
  it('reproduces the hook bytes of a real mainnet transfer', () => {
    const encoded = encodeForwardHook(REAL_RECIPIENT)
    const real = decodeCctpMessage(hexToBytes(REAL_MESSAGE)).body.hookData
    expect(hookToHex(encoded)).toBe(hookToHex(real))
  })

  it('is 88 bytes for a G address: 32 of header plus 56 of strkey', () => {
    expect(encodeForwardHook(REAL_RECIPIENT).length).toBe(88)
  })

  it('round trips a G address', () => {
    expect(decodeForwardHook(encodeForwardHook(REAL_RECIPIENT)).recipient).toBe(REAL_RECIPIENT)
  })

  it('round trips a muxed M address, which the forwarder also accepts', () => {
    const muxed = 'MA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVAAAAAAAAAAAAAJLK'
    expect(decodeForwardHook(encodeForwardHook(muxed)).recipient).toBe(muxed)
  })

  it('declines Circle relaying, so the magic bytes stay zero', () => {
    const hook = encodeForwardHook(REAL_RECIPIENT)
    expect(hook.subarray(0, 24).every((b) => b === 0)).toBe(true)
    expect(decodeForwardHook(hook).circleWillForward).toBe(false)
  })

  it('reads the real transfer as one the sender finalised itself', () => {
    const real = decodeCctpMessage(hexToBytes(REAL_MESSAGE))
    expect(recipientOf(real)).toEqual({ recipient: REAL_RECIPIENT, circleWillForward: false })
  })

  it('refuses a contract id as a payout recipient', () => {
    expect(() => encodeForwardHook(MAINNET_FORWARDER)).toThrow(ForwardHookError)
  })

  it('refuses a truncated address rather than encoding a dead one', () => {
    expect(() => encodeForwardHook(REAL_RECIPIENT.slice(0, 40))).toThrow(ForwardHookError)
  })

  it('refuses hook data that claims more recipient than it carries', () => {
    const hook = encodeForwardHook(REAL_RECIPIENT)
    expect(() => decodeForwardHook(hook.subarray(0, 60))).toThrow(/only/)
  })

  it('refuses an unsupported hook version', () => {
    const hook = encodeForwardHook(REAL_RECIPIENT)
    hook[27] = 9
    expect(() => decodeForwardHook(hook)).toThrow(/version 9/)
  })
})

describe('contract id as 32 bytes', () => {
  it('round trips', () => {
    expect(bytes32ToContract(contractToBytes32(MAINNET_FORWARDER))).toBe(MAINNET_FORWARDER)
  })

  it('matches what the real message names as its mint recipient', () => {
    const msg = decodeCctpMessage(hexToBytes(REAL_MESSAGE))
    expect(bytes32ToContract(hexToBytes(msg.body.mintRecipient))).toBe(MAINNET_FORWARDER)
  })

  it('refuses a G address, which would mint into nothing', () => {
    expect(() => contractToBytes32(REAL_RECIPIENT)).toThrow(ForwardHookError)
  })
})

describe('decoding a CCTP V2 message', () => {
  const msg = decodeCctpMessage(hexToBytes(REAL_MESSAGE))

  it('reads the header of the real transfer', () => {
    expect(msg.version).toBe(1)
    expect(msg.sourceDomain).toBe(6)
    expect(msg.destinationDomain).toBe(STELLAR_CCTP_DOMAIN)
    expect(msg.minFinalityThreshold).toBe(1000)
    expect(msg.finalityThresholdExecuted).toBe(1000)
  })

  it('names the Stellar TokenMessengerMinter as recipient', () => {
    expect(bytes32ToContract(hexToBytes(msg.recipient))).toBe(
      CONTRACTS.mainnet.cctp.tokenMessengerMinter,
    )
  })

  it('restricts the claim to the forwarder through destinationCaller', () => {
    expect(bytes32ToContract(hexToBytes(msg.destinationCaller))).toBe(MAINNET_FORWARDER)
  })

  it('reads the amounts in canonical 6-decimal units', () => {
    expect(msg.body.amount).toBe(79_784_024n)
    expect(msg.body.maxFee).toBe(12_445n)
    expect(msg.body.feeExecuted).toBe(10_371n)
  })

  it('reports what actually lands, net of the fast-transfer fee', () => {
    expect(amountToLand(msg)).toBe(79_773_653n)
  })

  it('carries an expiration, so a stale message cannot be replayed forever', () => {
    expect(msg.body.expirationBlock).toBe(64_594_603n)
  })

  it('refuses a message too short to be a burn', () => {
    expect(() => decodeCctpMessage(new Uint8Array(200))).toThrow(CctpMessageError)
  })

  it('refuses hex that is not hex', () => {
    expect(() => hexToBytes('0xzz')).toThrow(CctpMessageError)
  })
})

describe('guarding a claim against a message it was not asked for', () => {
  const msg = decodeCctpMessage(hexToBytes(REAL_MESSAGE))
  const good = {
    destinationDomain: STELLAR_CCTP_DOMAIN,
    forwarder: MAINNET_FORWARDER,
    recipient: REAL_RECIPIENT,
    sourceDomain: 6,
  }

  it('passes the transfer it describes', () => {
    expect(() => assertMessageMatches(msg, good)).not.toThrow()
  })

  it('refuses a message bound for another chain', () => {
    expect(() => assertMessageMatches(msg, { ...good, destinationDomain: 0 })).toThrow(/bound for/)
  })

  it('refuses a message that pays someone else', () => {
    const other = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
    expect(() => assertMessageMatches(msg, { ...good, recipient: other })).toThrow(/pays/)
  })

  it('refuses a message that mints to a forwarder we are not calling', () => {
    const testnetForwarder = CONTRACTS.testnet.cctp.forwarder
    expect(() => assertMessageMatches(msg, { ...good, forwarder: testnetForwarder })).toThrow(
      /not the forwarder/,
    )
  })

  it('refuses a message whose source domain is not the one claimed', () => {
    expect(() => assertMessageMatches(msg, { ...good, sourceDomain: 0 })).toThrow(/came from/)
  })
})

describe('attestation shape', () => {
  it('accepts the two signatures Circle actually returns', () => {
    expect(() => assertAttestation(new Uint8Array(130))).not.toThrow()
  })

  it('refuses a single signature when the threshold is two', () => {
    expect(() => assertAttestation(new Uint8Array(65))).toThrow(CctpMessageError)
  })

  it('refuses empty bytes', () => {
    expect(() => assertAttestation(new Uint8Array(0))).toThrow(CctpMessageError)
  })
})
