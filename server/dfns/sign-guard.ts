import { type Transaction, type FeeBumpTransaction } from '@stellar/stellar-sdk'
import { decimalToStroops } from '../../src/integrations/stellar/amount'

// ops allowed in any /dfns/sign envelope. anything else (AccountMerge,
// SetOptions adding a signer, ChangeTrust on a non-treasury asset, etc.)
// could exfiltrate funds or compromise the treasury account.
//
// invokeHostFunction is deliberately NOT here: a Soroban call from the
// treasury can invoke transfer() on the USDC SAC and drain the wallet
// without ever touching the destination whitelist or amount cap below.
// soroban-from-treasury needs its own envelope path with a contract-id
// allowlist, not the bare op type.
//
// the DEX offer ops (manageSellOffer/manageBuyOffer/createPassiveSellOffer)
// are out for the same reason: the cap and whitelist below only know about
// payment destinations, so an offer could sell treasury assets at a price an
// attacker dictates without tripping either check. they come back once they
// have their own price+amount bounds.
const ALLOWED_OPS = new Set([
  'payment',
  'pathPaymentStrictSend',
  'pathPaymentStrictReceive',
  'bumpSequence',
])

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
  if (list.length === 0 || !op.destination) return
  if (!list.includes(op.destination)) {
    throw new SignGuardRejected(`${kind} destination ${op.destination} not in whitelist`)
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
