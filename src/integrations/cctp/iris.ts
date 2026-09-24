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
})

const IrisMessagesSchema = z.object({ messages: z.array(IrisMessageSchema) })

const FeeTierSchema = z.object({
  finalityThreshold: z.number(),
  // basis points of the amount, not a flat amount
  minimumFee: z.number(),
})
const FeesSchema = z.array(FeeTierSchema)

export type IrisAttestation =
  | { state: 'pending'; delayReason: string | null }
  | {
      state: 'complete'
      message: `0x${string}`
      attestation: `0x${string}`
      eventNonce: string
    }

export class IrisError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IrisError'
  }
}

const EVM_TX_HASH = /^0x[0-9a-fA-F]{64}$/

async function getJson(url: string, timeoutMs: number): Promise<{ status: number; body: unknown }> {
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

// The message we submit has to be the one Circle returns: on a fast transfer the
// attester fills in the fee, so the EVM log is not the final message. Circle
// answers CORS *, so the browser asks directly. One look, no loop: the caller
// polls, so an unmounted component stops asking.
export async function fetchAttestation(
  network: Network,
  sourceDomain: number,
  txHash: string,
  timeoutMs = 10_000,
): Promise<IrisAttestation> {
  if (!EVM_TX_HASH.test(txHash)) throw new IrisError('not an EVM transaction hash')
  if (!Number.isInteger(sourceDomain) || sourceDomain < 0) throw new IrisError('bad source domain')

  const url = `${IRIS_BASE[network]}/v2/messages/${sourceDomain}?transactionHash=${txHash}`
  const { status, body } = await getJson(url, timeoutMs)

  // 404 until Circle has indexed the burn, the normal first answer
  if (status === 404) return { state: 'pending', delayReason: null }
  if (status === 429) throw new IrisError('Circle is rate limiting us, retrying shortly')
  if (status < 200 || status >= 300) throw new IrisError(`Circle answered ${status}`)

  const parsed = IrisMessagesSchema.safeParse(body)
  if (!parsed.success) throw new IrisError('Circle sent an answer we do not recognise')

  // we burn once per tx; if Circle lists several, take the Stellar one. A pending
  // entry is still 0x, hence the fallback
  const ours = parsed.data.messages.find((m) => messageDestination(m.message) === STELLAR_CCTP_DOMAIN)
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
  }
}

// bytes 8..11 of a CCTP message are the destination domain
function messageDestination(hex: string): number | null {
  if (!HEX.test(hex) || hex.length < 2 + 24) return null
  return parseInt(hex.slice(2 + 16, 2 + 24), 16)
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
