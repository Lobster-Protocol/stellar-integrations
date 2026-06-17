import {
  TransactionBuilder,
  FeeBumpTransaction,
  Networks,
  Address,
  type Transaction,
  type Operation,
} from '@stellar/stellar-sdk'

import { CONTRACTS, type Network } from '../../config/contracts'
import { decimalToStroops } from '../stellar/amount'

// ops the broker is allowed to push as part of a swap. a plain payment is not
// here: a real swap settles via path payments or Soroban router calls, never a
// bare payment to an arbitrary destination, and that would let a hostile broker
// xdr drain the trader. the DEX offer ops are out too: they carry their outflow
// in amount/buyAmount, which the spend cap below does not sum, so a hostile
// manageSellOffer could sell the whole balance at a dictated price and stay
// under the cap. the broker routes through path payments and the router
// contract; it has no need to push raw offers.
const ALLOWED_OP_TYPES = new Set([
  'pathPaymentStrictReceive',
  'pathPaymentStrictSend',
  'invokeHostFunction',
])

// 1 XLM. a real swap fee is a few thousand stroops; this only exists to stop a
// broker xdr from draining xlm through an inflated fee the spend cap can't see.
const MAX_FEE_STROOPS = 10_000_000n

export class BrokerTxRejected extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BrokerTxRejected'
  }
}

function networkFromPassphrase(p: string): Network | null {
  if (p === Networks.TESTNET) return 'testnet'
  if (p === Networks.PUBLIC) return 'mainnet'
  return null
}

// contracts a broker swap envelope may legitimately invoke. soroswap
// router + factory cover the AMM path; the SAC tokens are needed for
// approve / transfer authorizations the router calls into.
function sorobanAllowlist(net: Network): Set<string> {
  const c = CONTRACTS[net]
  return new Set(
    [c.soroswap.router, c.soroswap.factory, c.tokens.usdcSac, c.tokens.xlmSac].filter(Boolean),
  )
}

function invokedContractId(op: Operation.InvokeHostFunction): string | null {
  const func = op.func
  if (func.switch().name !== 'hostFunctionTypeInvokeContract') return null
  const args = func.invokeContract()
  try {
    return Address.fromScAddress(args.contractAddress()).toString()
  } catch {
    return null
  }
}

// throws if the xdr the broker is asking us to sign carries an op that
// does not belong to a swap, sources an account other than the trader,
// or invokes a contract that is not on the network's allowlist. checks
// run before the wallet kit ever sees the envelope.
// maxSpendStroops, when set, caps the total outflow of this envelope against the
// amount the trader agreed to in the quote. without it a hostile broker xdr that
// passed the op/source/contract checks could still send far more than quoted.
export function inspectBrokerTx(
  xdr: string,
  traderAccount: string,
  networkPassphrase: string,
  maxSpendStroops?: bigint,
): void {
  let tx: Transaction | FeeBumpTransaction
  try {
    tx = TransactionBuilder.fromXDR(xdr, networkPassphrase)
  } catch (err) {
    throw new BrokerTxRejected(`broker pushed an invalid xdr: ${(err as Error).message}`)
  }

  const inner = 'innerTransaction' in tx ? tx.innerTransaction : tx
  if (inner.source !== traderAccount) {
    throw new BrokerTxRejected(
      `tx source ${inner.source} does not match trader ${traderAccount}`,
    )
  }

  // a bloated fee is xlm leaving the trader that the spend cap never sees, since
  // the cap sums path-payment legs and not the fee. bound it directly. on a
  // fee-bump the outer account pays the bump, so bound that too when the trader
  // is funding it.
  if (inner.fee !== undefined && BigInt(inner.fee) > MAX_FEE_STROOPS) {
    throw new BrokerTxRejected(`tx fee ${inner.fee} stroops is over the ${MAX_FEE_STROOPS} ceiling`)
  }
  if (
    'innerTransaction' in tx &&
    tx.feeSource === traderAccount &&
    tx.fee !== undefined &&
    BigInt(tx.fee) > MAX_FEE_STROOPS
  ) {
    throw new BrokerTxRejected(`fee-bump fee ${tx.fee} stroops is over the ${MAX_FEE_STROOPS} ceiling`)
  }

  const net = networkFromPassphrase(networkPassphrase)
  const allowed = net ? sorobanAllowlist(net) : new Set<string>()

  let spent = 0n
  for (const op of inner.operations) {
    if (!ALLOWED_OP_TYPES.has(op.type)) {
      throw new BrokerTxRejected(`op type ${op.type} is not allowed in a swap envelope`)
    }
    if (op.source && op.source !== traderAccount) {
      throw new BrokerTxRejected(
        `op type ${op.type} sources ${op.source}, not the trader ${traderAccount}`,
      )
    }
    // the bought asset has to land back in the trader's account. without this a
    // broker xdr could debit the trader within the cap yet credit the proceeds
    // to its own wallet, draining a capped slice on every confirm. a muxed
    // destination won't string-match the trader's G address, so it fails closed.
    if (op.type === 'pathPaymentStrictSend' || op.type === 'pathPaymentStrictReceive') {
      const dest = (op as { destination?: string }).destination
      if (dest !== traderAccount) {
        throw new BrokerTxRejected(
          `path payment credits ${dest ?? 'an unset destination'}, not the trader ${traderAccount}`,
        )
      }
    }
    if (op.type === 'invokeHostFunction') {
      const contractId = invokedContractId(op as Operation.InvokeHostFunction)
      if (!contractId) {
        throw new BrokerTxRejected('invokeHostFunction without a contract address is not allowed')
      }
      if (!allowed.has(contractId)) {
        throw new BrokerTxRejected(
          `broker invoked contract ${contractId}, not in the network allowlist`,
        )
      }
      // a soroban call's spend lives in opaque contract args; the cap below
      // sums path-payment legs and cannot see it. under a spend cap we refuse
      // it rather than pass an unbounded amount. the broker can route the same
      // trade through path payments, which the cap does bound.
      if (maxSpendStroops !== undefined) {
        throw new BrokerTxRejected('a soroban invoke is not bound by the spend cap; route through path payments')
      }
    }
    // sendAmount is the fixed spend on a strict-send, sendMax the ceiling on a
    // strict-receive. either one bounds what leaves the trader's account.
    if (maxSpendStroops !== undefined) {
      if (op.type === 'pathPaymentStrictSend') {
        spent += decimalToStroops((op as { sendAmount: string }).sendAmount)
      } else if (op.type === 'pathPaymentStrictReceive') {
        spent += decimalToStroops((op as { sendMax: string }).sendMax)
      }
    }
  }

  if (maxSpendStroops !== undefined && spent > maxSpendStroops) {
    throw new BrokerTxRejected(
      `broker tx spends ${spent} stroops, over the agreed cap ${maxSpendStroops}`,
    )
  }
}
