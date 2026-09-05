import { TransactionBuilder, Address, scValToNative, type Transaction, type xdr } from '@stellar/stellar-sdk'

import { networkPassphrase } from '../lobster/client'
import type { Network } from '../lobster/types'

// decodes a transaction into a plain-language summary so a co-signer sees what
// they are approving instead of an opaque blob. the danger flags are the ones
// that matter for a shared-control account: an operation that sources from a
// different account than the one under review (the multi-source hijack that
// drained a separate account in the review's on-chain proof), and any op that
// rewrites who controls the account (set_options, account_merge).

export type OpDanger = 'none' | 'off-account' | 'account-control' | 'token-move'

export interface OpSummary {
  index: number
  type: string
  source: string
  offAccount: boolean
  detail: string
  danger: OpDanger
}

export interface TxSummary {
  txSource: string
  operationCount: number
  operations: OpSummary[]
  dangers: string[]
}

type AnyOp = Record<string, unknown>

function short(a: string): string {
  return a.length > 12 ? `${a.slice(0, 4)}...${a.slice(-4)}` : a
}

function assetCode(asset: unknown): string {
  const a = asset as { isNative?: () => boolean; getCode?: () => string }
  if (a?.isNative?.()) return 'XLM'
  if (typeof a?.getCode === 'function') return a.getCode()
  return 'asset'
}

interface TokenMove {
  from: string
  to: string
  amount: string
}

// a direct token move (transfer/transfer_from/burn on a SAC) is the exact drain
// motif shared control protects against, and no legit vault/swap flow builds one
// at the top level (those go through the vault or router contract), so decode its
// amount and recipient rather than showing an opaque "call transfer on C...".
function decodeInvoke(
  func: xdr.HostFunction | undefined,
): { fn: string; contract: string; move?: TokenMove } | null {
  try {
    if (!func || func.switch().name !== 'hostFunctionTypeInvokeContract') return null
    const call = func.invokeContract()
    const contract = Address.fromScAddress(call.contractAddress()).toString()
    const fn = call.functionName().toString()
    const args = call.args()
    let move: TokenMove | undefined
    if ((fn === 'transfer' || fn === 'transfer_from') && args.length >= 3) {
      const o = fn === 'transfer_from' ? 1 : 0
      move = {
        from: String(scValToNative(args[o])),
        to: String(scValToNative(args[o + 1])),
        amount: String(scValToNative(args[o + 2])),
      }
    } else if (fn === 'burn' && args.length >= 2) {
      move = { from: String(scValToNative(args[0])), to: 'burned', amount: String(scValToNative(args[1])) }
    }
    return { fn, contract, move }
  } catch {
    return null
  }
}

function sorobanDetail(func: xdr.HostFunction | undefined): string {
  const d = decodeInvoke(func)
  if (!d) return 'upload or deploy a contract'
  if (d.move) {
    return d.move.to === 'burned'
      ? `burn ${d.move.amount} tokens from ${short(d.move.from)}`
      : `move ${d.move.amount} tokens from ${short(d.move.from)} to ${short(d.move.to)}`
  }
  return `call ${d.fn} on ${short(d.contract)}`
}

function opDetail(op: AnyOp): string {
  const s = (k: string) => String(op[k])
  switch (op.type) {
    case 'payment':
      return `send ${s('amount')} ${assetCode(op.asset)} to ${short(s('destination'))}`
    case 'pathPaymentStrictSend':
      return `send up to ${s('sendAmount')} ${assetCode(op.sendAsset)} to ${short(s('destination'))}`
    case 'pathPaymentStrictReceive':
      return `send ${assetCode(op.sendAsset)} (max ${s('sendMax')}) to ${short(s('destination'))}`
    case 'createAccount':
      return `create account ${short(s('destination'))} with ${s('startingBalance')} XLM`
    case 'accountMerge':
      return `merge this account into ${short(s('destination'))}, which empties it`
    case 'changeTrust':
      return `set a trustline for ${assetCode(op.line)}`
    case 'setOptions':
      return setOptionsDetail(op)
    case 'manageSellOffer':
    case 'createPassiveSellOffer':
      return `place a sell offer: ${s('amount')} ${assetCode(op.selling)} for ${assetCode(op.buying)}`
    case 'manageBuyOffer':
      return `place a buy offer: ${s('buyAmount')} ${assetCode(op.buying)} for ${assetCode(op.selling)}`
    case 'createClaimableBalance':
      return `lock ${s('amount')} ${assetCode(op.asset)} into a claimable balance`
    case 'invokeHostFunction':
      return sorobanDetail(op.func as xdr.HostFunction | undefined)
    default:
      return String(op.type)
  }
}

// spell out which controls a set_options changes, so a co-signer sees a seizure
// (master weight to 0, a new signer, a threshold rewrite) instead of a generic
// "change account settings".
function setOptionsDetail(op: AnyOp): string {
  const parts: string[] = []
  const signer = op.signer as { ed25519PublicKey?: string; weight?: number } | undefined
  if (signer?.ed25519PublicKey !== undefined) {
    parts.push(`signer ${short(signer.ed25519PublicKey)} at weight ${String(signer.weight)}`)
  }
  if (op.masterWeight !== undefined) parts.push(`master key weight ${String(op.masterWeight)}`)
  if (op.lowThreshold !== undefined || op.medThreshold !== undefined || op.highThreshold !== undefined) {
    parts.push('the signing thresholds')
  }
  return parts.length ? `change account control: ${parts.join(', ')}` : 'change account settings'
}

const VALUE_BLEED_OPS = new Set([
  'manageSellOffer',
  'manageBuyOffer',
  'createPassiveSellOffer',
  'createClaimableBalance',
])

function summarizeTxObject(tx: Transaction, accountUnderReview: string): TxSummary {
  const dangers: string[] = []
  const operations: OpSummary[] = (tx.operations as unknown as AnyOp[]).map((op, index) => {
    const source = (op.source as string | undefined) ?? tx.source
    const offAccount = source !== accountUnderReview
    const control = op.type === 'setOptions' || op.type === 'accountMerge'
    const move =
      op.type === 'invokeHostFunction' ? decodeInvoke(op.func as xdr.HostFunction | undefined)?.move : undefined
    const valueBleed = VALUE_BLEED_OPS.has(String(op.type))
    let danger: OpDanger = 'none'
    if (control) danger = 'account-control'
    else if (offAccount) danger = 'off-account'
    else if (move || valueBleed) danger = 'token-move'
    if (offAccount) {
      dangers.push(`Operation ${index + 1} sends from ${short(source)}, not the account you are approving.`)
    }
    if (op.type === 'accountMerge') {
      dangers.push(`Operation ${index + 1} merges an account away, which empties it.`)
    } else if (op.type === 'setOptions') {
      dangers.push(`Operation ${index + 1} changes who controls the account.`)
    }
    if (move) {
      dangers.push(
        move.to === 'burned'
          ? `Operation ${index + 1} burns ${move.amount} tokens from ${short(move.from)}.`
          : `Operation ${index + 1} moves ${move.amount} tokens to ${short(move.to)}.`,
      )
    } else if (valueBleed) {
      dangers.push(`Operation ${index + 1} moves value out through ${String(op.type)}. Check its amounts and prices.`)
    }
    return { index, type: String(op.type), source, offAccount, detail: opDetail(op), danger }
  })
  return { txSource: tx.source, operationCount: operations.length, operations, dangers }
}

export function summarizeTx(xdrStr: string, network: Network, accountUnderReview: string): TxSummary {
  const parsed = TransactionBuilder.fromXDR(xdrStr, networkPassphrase(network))
  // a fee bump is refused before signing elsewhere, but summarize the inner tx
  // rather than hide it, so a wrapped op can never pass unseen.
  const tx = 'innerTransaction' in parsed ? parsed.innerTransaction : parsed
  return summarizeTxObject(tx, accountUnderReview)
}
