import { type Transaction, type FeeBumpTransaction } from '@stellar/stellar-sdk'
import { decimalToStroops } from '../../src/integrations/stellar/amount'

// only value-bounded classic ops may sign from the treasury. soroban calls and
// DEX offers are excluded: their outflow escapes the amount cap and destination
// whitelist below (a soroban transfer() or a dictated-price offer would drain the
// treasury unchecked). changeTrust is in because it moves no value.
const ALLOWED_OPS = new Set([
  'payment',
  'pathPaymentStrictSend',
  'pathPaymentStrictReceive',
  'bumpSequence',
  'changeTrust',
])

// 1 XLM. no classic treasury op needs a fee this large; bounding it stops a drain
// through an inflated fee the amount cap can't see, same as the broker guard.
const MAX_FEE_STROOPS = 10_000_000n

export class SignGuardRejected extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SignGuardRejected'
  }
}

export interface SignGuardConfig {
  // env-set address of the treasury wallet whose key DFNS holds. every tx
  // submitted to /dfns/sign must source from this account.
  treasuryAddress: string
  // env-set list of destinations any payment / path payment may target.
  // empty list = whitelist disabled (testing path); production should set it.
  destinationWhitelist: string[]
  // env-set hard cap for any payment-style op, expressed in stroops.
  // 0 = no cap (testing path); production should set a positive value.
  maxAmountStroops: bigint
}

function inner(tx: Transaction | FeeBumpTransaction): Transaction {
  // FeeBumpTransaction wraps an inner Transaction; the source rule applies
  // to the inner tx where the actual ops live.
  return 'innerTransaction' in tx ? tx.innerTransaction : tx
}

// caps the actual outflow. each payment kind carries the spend in a different
// field (payment.amount, strictSend.sendAmount, strictReceive.sendMax), so the
// caller passes the right one. when a cap is set we refuse an op with no
// recognizable amount rather than letting it through uncapped.
function checkAmount(amount: string | undefined, max: bigint, kind: string): void {
  if (max <= 0n) return
  if (amount === undefined) {
    throw new SignGuardRejected(`${kind} has no cappable amount field`)
  }
  if (decimalToStroops(amount) > max) {
    throw new SignGuardRejected(`${kind} amount ${amount} exceeds cap`)
  }
}

function checkDestination(op: { destination?: string }, list: string[], kind: string): void {
  if (list.length === 0) return
  // fail closed on a missing destination, like checkAmount does on a missing
  // amount: a whitelist that silently waved through a destination-less op would
  // be a hole in the last line of defense.
  if (!op.destination || !list.includes(op.destination)) {
    throw new SignGuardRejected(`${kind} destination ${op.destination ?? '(unset)'} not in whitelist`)
  }
}

export function inspectSignXdr(
  tx: Transaction | FeeBumpTransaction,
  cfg: SignGuardConfig,
): void {
  const t = inner(tx)
  if (t.source !== cfg.treasuryAddress) {
    throw new SignGuardRejected(
      `tx source ${t.source} does not match treasury ${cfg.treasuryAddress}`,
    )
  }
  // the outer fee is what the treasury pays (a fee-bump's inner fee is 0), and the
  // amount cap never sees it, so bound it here.
  if (BigInt(tx.fee) > MAX_FEE_STROOPS) {
    throw new SignGuardRejected(`tx fee ${tx.fee} stroops is over the ${MAX_FEE_STROOPS} ceiling`)
  }
  for (const op of t.operations) {
    if (!ALLOWED_OPS.has(op.type)) {
      throw new SignGuardRejected(`op type ${op.type} is not allowed`)
    }
    if (op.source && op.source !== cfg.treasuryAddress) {
      throw new SignGuardRejected(
        `op ${op.type} sources ${op.source}, not the treasury`,
      )
    }
    if (op.type === 'payment') {
      const p = op as { destination?: string; amount?: string }
      checkDestination(p, cfg.destinationWhitelist, op.type)
      checkAmount(p.amount, cfg.maxAmountStroops, op.type)
    } else if (op.type === 'pathPaymentStrictSend') {
      const p = op as { destination?: string; sendAmount?: string }
      checkDestination(p, cfg.destinationWhitelist, op.type)
      checkAmount(p.sendAmount, cfg.maxAmountStroops, op.type)
    } else if (op.type === 'pathPaymentStrictReceive') {
      const p = op as { destination?: string; sendMax?: string }
      checkDestination(p, cfg.destinationWhitelist, op.type)
      checkAmount(p.sendMax, cfg.maxAmountStroops, op.type)
    }
  }
}

export function readSignGuardConfig(): SignGuardConfig | null {
  const treasury = process.env.DFNS_TREASURY_ADDRESS
  if (!treasury) return null
  const list = (process.env.DFNS_DESTINATION_WHITELIST ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const capStr = process.env.DFNS_MAX_AMOUNT_STROOPS ?? '0'
  const cap = BigInt(capStr)
  // empty whitelist or zero cap silently disable those checks; we refuse
  // to ship a config that lets the signer through with no bounds unless
  // the operator opts in via DFNS_GUARD_PERMISSIVE=1 (testing path only).
  const permissive = process.env.DFNS_GUARD_PERMISSIVE === '1'
  if (!permissive && (list.length === 0 || cap <= 0n)) return null
  return {
    treasuryAddress: treasury,
    destinationWhitelist: list,
    maxAmountStroops: cap,
  }
}
