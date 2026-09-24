import { decodeForwardHook, bytes32ToContract, readU32, toHex, type ForwardHook } from './forward-hook'

const HEADER_LEN = 148
const BODY_MIN_LEN = 228

export class CctpMessageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CctpMessageError'
  }
}

export interface CctpMessage {
  version: number
  sourceDomain: number
  destinationDomain: number
  nonce: `0x${string}`
  sender: `0x${string}`
  // the TokenMessengerMinter on the destination chain
  recipient: `0x${string}`
  destinationCaller: `0x${string}`
  minFinalityThreshold: number
  finalityThresholdExecuted: number
  body: CctpBurnBody
}

export interface CctpBurnBody {
  version: number
  burnToken: `0x${string}`
  mintRecipient: `0x${string}`
  // canonical units, 6 decimals for USDC, as sent by the source chain
  amount: bigint
  messageSender: `0x${string}`
  maxFee: bigint
  feeExecuted: bigint
  // ledger or block past which the message is refused, 0 for never
  expirationBlock: bigint
  hookData: Uint8Array
}

export function hexToBytes(value: string): Uint8Array {
  const clean = value.startsWith('0x') || value.startsWith('0X') ? value.slice(2) : value
  if (clean.length === 0 || clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) {
    throw new CctpMessageError('expected an even-length hex string')
  }
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

function u256(raw: Uint8Array, o: number): bigint {
  let v = 0n
  for (let i = 0; i < 32; i++) v = (v << 8n) | BigInt(raw[o + i])
  return v
}

// The bytes we submit come back from Circle, so they get decoded and checked
// against the transfer we meant before anything goes out. Header is 148 bytes,
// the burn body 228 more before the hook.
export function decodeCctpMessage(raw: Uint8Array): CctpMessage {
  if (raw.length < HEADER_LEN + BODY_MIN_LEN) {
    throw new CctpMessageError(
      `message is ${raw.length} bytes, a burn message needs at least ${HEADER_LEN + BODY_MIN_LEN}`,
    )
  }
  const b = raw.subarray(HEADER_LEN)
  return {
    version: readU32(raw, 0),
    sourceDomain: readU32(raw, 4),
    destinationDomain: readU32(raw, 8),
    nonce: toHex(raw.subarray(12, 44)),
    sender: toHex(raw.subarray(44, 76)),
    recipient: toHex(raw.subarray(76, 108)),
    destinationCaller: toHex(raw.subarray(108, 140)),
    minFinalityThreshold: readU32(raw, 140),
    finalityThresholdExecuted: readU32(raw, 144),
    body: {
      version: readU32(b, 0),
      burnToken: toHex(b.subarray(4, 36)),
      mintRecipient: toHex(b.subarray(36, 68)),
      amount: u256(b, 68),
      messageSender: toHex(b.subarray(100, 132)),
      maxFee: u256(b, 132),
      feeExecuted: u256(b, 164),
      expirationBlock: u256(b, 196),
      hookData: b.subarray(228),
    },
  }
}

// Circle takes its fast fee out of the amount, so this is what lands
export function amountToLand(msg: CctpMessage): bigint {
  return msg.body.amount - msg.body.feeExecuted
}

export function recipientOf(msg: CctpMessage): ForwardHook {
  return decodeForwardHook(msg.body.hookData)
}

export interface MessageExpectation {
  destinationDomain: number
  // the forwarder we are about to call, as a contract id
  forwarder: string
  // the Stellar account the caller claims this transfer is for
  recipient: string
  sourceDomain?: number
}

// runs before anything is submitted, the relay included
export function assertMessageMatches(msg: CctpMessage, expect: MessageExpectation): void {
  if (msg.destinationDomain !== expect.destinationDomain) {
    throw new CctpMessageError(
      `message is bound for domain ${msg.destinationDomain}, not ${expect.destinationDomain}`,
    )
  }
  if (expect.sourceDomain !== undefined && msg.sourceDomain !== expect.sourceDomain) {
    throw new CctpMessageError(
      `message came from domain ${msg.sourceDomain}, not the ${expect.sourceDomain} that was claimed`,
    )
  }
  const mintRecipient = bytes32ToContract(hexToBytes(msg.body.mintRecipient))
  if (mintRecipient !== expect.forwarder) {
    throw new CctpMessageError(
      `message mints to ${mintRecipient}, which is not the forwarder ${expect.forwarder}`,
    )
  }
  const hook = recipientOf(msg)
  if (hook.recipient !== expect.recipient) {
    throw new CctpMessageError(
      `message pays ${hook.recipient}, not the ${expect.recipient} that was claimed`,
    )
  }
}

// 65 bytes per signature, and Circle currently wants two
const SIGNATURE_LEN = 65

export function assertAttestation(raw: Uint8Array, threshold = 2): void {
  if (raw.length !== SIGNATURE_LEN * threshold) {
    throw new CctpMessageError(
      `attestation is ${raw.length} bytes, expected ${SIGNATURE_LEN * threshold} for ${threshold} signatures`,
    )
  }
}
