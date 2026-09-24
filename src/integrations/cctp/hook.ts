import { StrKey } from '@stellar/stellar-sdk'

// A burn names its mint recipient as a contract id, so paying a G account goes
// through Circle's CctpForwarder: it mints to itself, then pays whoever this
// hook names. Layout, from Circle's cctp-forwarder source:
//   bytes 0..23   magic "cctp-forward", or zeros
//   bytes 24..27  hook version, u32 big-endian, 0
//   bytes 28..31  recipient length, u32 big-endian
//   bytes 32..    the recipient strkey, unpadded
// The magic asks Circle's relayer to finish the transfer. We leave it zero and
// finish it ourselves, so the delivery hash is ours.

const MAGIC_LEN = 24
const VERSION_OFFSET = 24
const LENGTH_OFFSET = 28
const RECIPIENT_OFFSET = 32
const HOOK_VERSION = 0

export class ForwardHookError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ForwardHookError'
  }
}

// the forwarder pays M addresses too
function assertDeliverable(address: string): void {
  if (StrKey.isValidEd25519PublicKey(address)) return
  if (StrKey.isValidMed25519PublicKey(address)) return
  throw new ForwardHookError(
    `'${address}' is not a Stellar account the forwarder can pay. Expected a G or M address.`,
  )
}

function writeU32(view: Uint8Array, offset: number, value: number): void {
  view[offset] = (value >>> 24) & 0xff
  view[offset + 1] = (value >>> 16) & 0xff
  view[offset + 2] = (value >>> 8) & 0xff
  view[offset + 3] = value & 0xff
}

function readU32(view: Uint8Array, offset: number): number {
  return (
    ((view[offset] << 24) | (view[offset + 1] << 16) | (view[offset + 2] << 8) | view[offset + 3]) >>>
    0
  )
}

export function encodeForwardHook(stellarAddress: string): Uint8Array {
  assertDeliverable(stellarAddress)
  const recipient = new TextEncoder().encode(stellarAddress)
  const out = new Uint8Array(RECIPIENT_OFFSET + recipient.length)
  // bytes 0..23 stay zero
  writeU32(out, VERSION_OFFSET, HOOK_VERSION)
  writeU32(out, LENGTH_OFFSET, recipient.length)
  out.set(recipient, RECIPIENT_OFFSET)
  return out
}

export interface ForwardHook {
  recipient: string
  // true when the sender asked Circle to finalise the transfer for them
  circleWillForward: boolean
}

export function decodeForwardHook(hook: Uint8Array): ForwardHook {
  if (hook.length < RECIPIENT_OFFSET) {
    throw new ForwardHookError(`hook data is ${hook.length} bytes, needs at least ${RECIPIENT_OFFSET}`)
  }
  const version = readU32(hook, VERSION_OFFSET)
  if (version !== HOOK_VERSION) {
    throw new ForwardHookError(`hook version ${version} is not supported, expected ${HOOK_VERSION}`)
  }
  const length = readU32(hook, LENGTH_OFFSET)
  const end = RECIPIENT_OFFSET + length
  if (hook.length < end) {
    throw new ForwardHookError(`hook says the recipient is ${length} bytes but only ${hook.length - RECIPIENT_OFFSET} follow`)
  }
  const recipient = new TextDecoder().decode(hook.subarray(RECIPIENT_OFFSET, end))
  assertDeliverable(recipient)
  let circleWillForward = false
  for (let i = 0; i < MAGIC_LEN; i++) {
    if (hook[i] !== 0) {
      circleWillForward = true
      break
    }
  }
  return { recipient, circleWillForward }
}

export function hookToHex(hook: Uint8Array): `0x${string}` {
  let out = ''
  for (const b of hook) out += b.toString(16).padStart(2, '0')
  return `0x${out}`
}

// mintRecipient and destinationCaller both take the forwarder as 32 raw bytes
export function contractToBytes32(contractId: string): Uint8Array {
  if (!StrKey.isValidContract(contractId)) {
    throw new ForwardHookError(`'${contractId}' is not a Stellar contract id`)
  }
  return new Uint8Array(StrKey.decodeContract(contractId))
}

export function bytes32ToContract(raw: Uint8Array): string {
  if (raw.length !== 32) throw new ForwardHookError(`expected 32 bytes, got ${raw.length}`)
  return StrKey.encodeContract(Buffer.from(raw))
}

export function contractToBytes32Hex(contractId: string): `0x${string}` {
  return hookToHex(contractToBytes32(contractId))
}
