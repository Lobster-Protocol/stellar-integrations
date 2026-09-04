import { Address, xdr, type Transaction, type FeeBumpTransaction } from '@stellar/stellar-sdk'
import { decimalToStroops } from '../../src/integrations/stellar/amount'
import { CONTRACTS } from '../../src/config/contracts'

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

// A soroban invocation is admitted only as a named view on a contract the
// operator listed, carrying no authorization entries. A view returns a value and
// signs nothing away; without auth entries the invocation cannot move a token,
// because a SAC transfer needs the treasury's own authorization to be attached.
// Anything else stays out, for the reason above.
const SOROBAN_VIEW_METHODS = new Set([
  'get_admin',
  'get_pool_count',
  'get_wasm_hash',
  'get_owner',
  'get_multisig',
])

// the operator can name the contracts explicitly. with none named we fall back
// to our own factory ids instead of to nothing, because a zero-argument view on
// a contract we deployed gives a caller nothing, while an unset variable meant
// the one button a reviewer is asked to press failed with a config message.
function viewContracts(): string[] {
  const named = (process.env.DFNS_SOROBAN_VIEW_CONTRACTS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (named.length > 0) return named
  return Object.values(CONTRACTS)
    .map((c) => c.lobster.factory)
    .filter(Boolean)
}

// Throws unless the operation is one of those views. Reads the invocation out of
// the envelope rather than trusting anything the caller says about it.
export function checkSorobanView(op: unknown, allowed: string[]): void {
  if (allowed.length === 0) {
    throw new SignGuardRejected('soroban views are not enabled on this signer')
  }
  const { func, auth } = op as { func?: xdr.HostFunction; auth?: unknown[] }
  if (auth && auth.length > 0) {
    throw new SignGuardRejected('soroban invocation carries authorization entries')
  }
  if (!func || func.switch().name !== 'hostFunctionTypeInvokeContract') {
    throw new SignGuardRejected('only a contract invocation is allowed, not an upload or a deploy')
  }
  const call = func.invokeContract()
  const contract = Address.fromScAddress(call.contractAddress()).toString()
  if (!allowed.includes(contract)) {
    throw new SignGuardRejected(`contract ${contract} is not in the view allowlist`)
  }
  const fn = call.functionName().toString()
  if (!SOROBAN_VIEW_METHODS.has(fn)) {
    throw new SignGuardRejected(`${fn}() is not a read-only method`)
  }
  if (call.args().length > 0) {
    throw new SignGuardRejected(`${fn}() takes no arguments on this path`)
  }
}

// 1 XLM. no classic treasury op needs a fee this large; bounding it stops a drain
// through an inflated fee the amount cap can't see, same as the broker guard.
const MAX_FEE_STROOPS = 10_000_000n

// what a payment is capped at when the operator set no cap. two cases, because
// they carry different risk. with no whitelist either, the only destination left
// is the treasury itself, and an account paying itself loses nothing but the
// fee, so the ceiling can be roomy enough for the custody demo to cross the
// approval threshold. with a whitelist set but no cap, the destination can be
// somebody else, so it stays tight.
const SELF_ONLY_CAP_STROOPS = 1_000_000_000n
const FALLBACK_CAP_STROOPS = 10_000_000n

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
  // destinations any payment / path payment may target. an empty list here
  // still disables the check, so readSignGuardConfig never hands one over:
  // when the operator sets nothing it falls back to the treasury itself.
  destinationWhitelist: string[]
  // contracts a read-only soroban view may target. an empty list refuses every
  // soroban invocation. readSignGuardConfig falls back to our own factory ids
  // when the operator names none.
  sorobanViewContracts?: string[]
  // hard cap for any payment-style op, in stroops. 0 disables the check, so
  // readSignGuardConfig substitutes a low cap rather than passing 0 through.
  maxAmountStroops: bigint
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
  // a fee bump wraps the real tx; the source rule applies to the inner one,
  // where the ops live.
  const inner = 'innerTransaction' in tx ? tx.innerTransaction : tx
  if (inner.source !== cfg.treasuryAddress) {
    throw new SignGuardRejected(
      `tx source ${inner.source} does not match treasury ${cfg.treasuryAddress}`,
    )
  }
  // the outer fee is what the treasury pays (a fee-bump's inner fee is 0), and the
  // amount cap never sees it, so bound it here.
  if (BigInt(tx.fee) > MAX_FEE_STROOPS) {
    throw new SignGuardRejected(`tx fee ${tx.fee} stroops is over the ${MAX_FEE_STROOPS} ceiling`)
  }
  for (const op of inner.operations) {
    if (op.type === 'invokeHostFunction') {
      checkSorobanView(op, cfg.sorobanViewContracts ?? [])
      continue
    }
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
  // permissive used to mean unbounded, and the browser token that reaches this
  // route rides in the public bundle, so anyone could queue a payment from the
  // treasury to any address for any amount. a probe on 2026-09-03 got one
  // accepted. permissive now only means the operator may leave the two
  // variables unset: the treasury falls back to paying itself, under a low cap.
  const selfOnly = list.length === 0
  return {
    treasuryAddress: treasury,
    destinationWhitelist: selfOnly ? [treasury] : list,
    maxAmountStroops: cap > 0n ? cap : selfOnly ? SELF_ONLY_CAP_STROOPS : FALLBACK_CAP_STROOPS,
    sorobanViewContracts: viewContracts(),
  }
}
