import { z } from 'zod'

import { CCTP_FINALITY, IRIS_BASE, STELLAR_CCTP_DOMAIN, type Network } from '../../config/contracts'

const HEX = /^0x[0-9a-fA-F]+$/

const IrisMessageSchema = z.object({
  message: z.string(),
  // "PENDING" until the attesters have signed, then hex
  attestation: z.string(),
  eventNonce: z.string(),
  cctpVersion: z.number(),
  status: z.string(),
  // Circle's reason when it holds a transfer, e.g. a fee under the minimum
  delayReason: z.string().nullable().optional(),
  // only on a burn that asked Circle to mint on the other side: PENDING, then COMPLETE
  forwardState: z.string().nullable().optional(),
  forwardTxHash: z.string().nullable().optional(),
})

const IrisMessagesSchema = z.object({ messages: z.array(IrisMessageSchema) })

// 6-decimal USDC units, what Circle charges to mint on the destination for you
const ForwardFeeSchema = z.object({ low: z.number(), med: z.number(), high: z.number() })

const FeeTierSchema = z.object({
  finalityThreshold: z.number(),
  // basis points of the amount, not a flat amount
  minimumFee: z.number(),
  forwardFee: ForwardFeeSchema.optional(),
})
const FeesSchema = z.array(FeeTierSchema)

export type IrisAttestation =
  | { state: 'pending'; delayReason: string | null }
  | {
      state: 'complete'
      message: `0x${string}`
      attestation: `0x${string}`
      eventNonce: string
      forwardState: string | null
      forwardTxHash: string | null
    }

export class IrisError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IrisError'
  }
}

const EVM_TX_HASH = /^0x[0-9a-fA-F]{64}$/
const STELLAR_TX_HASH = /^[0-9a-fA-F]{64}$/

// Circle files a Stellar burn under its bare hash and finds nothing for the 0x form
export function irisTxHash(sourceDomain: number, txHash: string): string {
  if (sourceDomain === STELLAR_CCTP_DOMAIN) {
    const bare = txHash.replace(/^0x/i, '').toLowerCase()
    if (!STELLAR_TX_HASH.test(bare)) throw new IrisError('not a Stellar transaction hash')
    return bare
  }
  if (!EVM_TX_HASH.test(txHash)) throw new IrisError('not an EVM transaction hash')
  return txHash
}

// Circle locks a caller out for five minutes above 35 requests a second across all routes,
// and the browser cannot read the lockout response. Ten a second per page keeps a few tabs under
const IRIS_EVERY_MS = 100
let irisNext = 0

// the next turn counts from when a request really leaves: a timer that fired late must not
// let the one after it go sooner
async function irisTurn(): Promise<void> {
  for (;;) {
    const now = Date.now()
    if (now >= irisNext) {
      irisNext = now + IRIS_EVERY_MS
      return
    }
    await new Promise((r) => setTimeout(r, irisNext - now))
  }
}

async function getJson(url: string, timeoutMs: number): Promise<{ status: number; body: unknown }> {
  await irisTurn()
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } })
    const body = await res.json().catch(() => null)
    return { status: res.status, body }
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw new IrisError('Circle did not answer in time')
    throw new IrisError(`could not reach Circle: ${(err as Error).message}`)
  } finally {
    clearTimeout(timer)
  }
}

// iris answers with CORS *, so the browser asks it directly. Submit Circle's message, not
// the EVM log: on a fast transfer the attester fills in the fee. One request; callers poll
export async function fetchAttestation(
  network: Network,
  sourceDomain: number,
  txHash: string,
  timeoutMs = 10_000,
  // where the burn is bound: Stellar on the way in, the EVM chain's domain on the way
  // out, null to take whatever Circle lists first
  destinationDomain: number | null = STELLAR_CCTP_DOMAIN,
): Promise<IrisAttestation> {
  if (!Number.isInteger(sourceDomain) || sourceDomain < 0) throw new IrisError('bad source domain')
  const hash = irisTxHash(sourceDomain, txHash)

  const url = `${IRIS_BASE[network]}/v2/messages/${sourceDomain}?transactionHash=${hash}`
  const { status, body } = await getJson(url, timeoutMs)

  // 404 until Circle has indexed the burn, the normal first answer
  if (status === 404) return { state: 'pending', delayReason: null }
  if (status === 429) throw new IrisError('Circle is rate limiting us, retrying shortly')
  if (status < 200 || status >= 300) throw new IrisError(`Circle answered ${status}`)

  const parsed = IrisMessagesSchema.safeParse(body)
  if (!parsed.success) throw new IrisError('Circle sent an answer we do not recognise')

  // we burn once per tx; if Circle lists several, take the one whose destination
  // domain (bytes 8..11) is ours. A pending entry's message is still 0x, so fall back to the first
  const ours = parsed.data.messages.find(
    (m) =>
      destinationDomain !== null &&
      HEX.test(m.message) &&
      m.message.length >= 2 + 24 &&
      parseInt(m.message.slice(2 + 16, 2 + 24), 16) === destinationDomain,
  )
  const m = ours ?? parsed.data.messages[0]
  if (!m) return { state: 'pending', delayReason: null }

  if (m.status !== 'complete' || !HEX.test(m.attestation) || !HEX.test(m.message)) {
    return { state: 'pending', delayReason: m.delayReason ?? null }
  }
  return {
    state: 'complete',
    message: m.message as `0x${string}`,
    attestation: m.attestation as `0x${string}`,
    eventNonce: m.eventNonce,
    forwardState: m.forwardState ?? null,
    forwardTxHash: m.forwardTxHash && EVM_TX_HASH.test(m.forwardTxHash) ? m.forwardTxHash : null,
  }
}

export interface CctpFees {
  // basis points charged for a fast transfer, null when Circle offers none
  fastBps: number | null
  // basis points for a standard transfer, 0 today
  standardBps: number | null
}

export async function fetchFees(
  network: Network,
  sourceDomain: number,
  timeoutMs = 8_000,
): Promise<CctpFees> {
  const url = `${IRIS_BASE[network]}/v2/burn/USDC/fees/${sourceDomain}/${STELLAR_CCTP_DOMAIN}`
  const { status, body } = await getJson(url, timeoutMs)
  if (status < 200 || status >= 300) throw new IrisError(`Circle fee lookup answered ${status}`)
  const parsed = FeesSchema.safeParse(body)
  if (!parsed.success) throw new IrisError('Circle fee answer has an unexpected shape')
  const at = (t: number) => parsed.data.find((f) => f.finalityThreshold === t)?.minimumFee ?? null
  return { fastBps: at(CCTP_FINALITY.fast), standardBps: at(CCTP_FINALITY.standard) }
}

export interface ForwardQuote {
  // 6-decimal units; Circle keeps the whole max fee when it mints for you, so this
  // is the price, not a ceiling
  fee: bigint
  // Circle's protocol fee in basis points, 0 from Stellar today
  bps: number
}

// what Circle charges to mint a Stellar burn on the EVM chain for you. Stellar
// finalises in seconds, so Circle quotes the same for both thresholds
export async function fetchForwardQuote(
  network: Network,
  destinationDomain: number,
  timeoutMs = 8_000,
): Promise<ForwardQuote> {
  const url = `${IRIS_BASE[network]}/v2/burn/USDC/fees/${STELLAR_CCTP_DOMAIN}/${destinationDomain}?forward=true`
  const { status, body } = await getJson(url, timeoutMs)
  if (status < 200 || status >= 300) throw new IrisError(`Circle fee lookup answered ${status}`)
  const parsed = FeesSchema.safeParse(body)
  if (!parsed.success) throw new IrisError('Circle fee answer has an unexpected shape')
  const tier =
    parsed.data.find((f) => f.finalityThreshold === CCTP_FINALITY.standard) ??
    parsed.data.find((f) => f.finalityThreshold === CCTP_FINALITY.fast)
  if (!tier?.forwardFee) throw new IrisError('Circle does not deliver to that chain for you')
  // top of Circle's range: anything over the real cost buys priority, so the mint doesn't stall
  return { fee: BigInt(Math.ceil(tier.forwardFee.high)), bps: tier.minimumFee }
}

// Circle won't attest a fast burn whose maxFee is under its current minimum, and
// the minimum moves, so leave headroom. It charges feeExecuted, not this.
export function maxFeeFor(amountUnits: bigint, bps: number, headroom = 1.5): bigint {
  if (amountUnits <= 0n || bps <= 0) return 0n
  // work in hundredths of a basis point so a fractional bps like 1.3 survives
  const scaled = BigInt(Math.ceil(bps * headroom * 100))
  const fee = (amountUnits * scaled + 1_000_000n - 1n) / 1_000_000n
  // at least one unit, so a tiny transfer still clears the minimum
  return fee > 0n ? fee : 1n
}
