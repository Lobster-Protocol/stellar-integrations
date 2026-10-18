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

// no bare payment or DEX offer: their outflow escapes the spend cap below.
const ALLOWED_OP_TYPES = new Set([
  'pathPaymentStrictReceive',
  'pathPaymentStrictSend',
  'invokeHostFunction',
])

// 1 XLM. the spend cap doesn't count fees, so an inflated one could drain xlm.
const MAX_FEE_STROOPS = 10_000_000n

export class BrokerTxRejected extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BrokerTxRejected'
  }
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

// maxSpendStroops, when set, caps total outflow at what the trader agreed to in the quote.
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

  // a fee-bump's outer fee is the trader's money too when the trader is its fee source.
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

  // the soroswap router and factory cover the AMM path; the SACs are there for the
  // approve / transfer authorizations the router calls into.
  const net: Network | null =
    networkPassphrase === Networks.TESTNET ? 'testnet' : networkPassphrase === Networks.PUBLIC ? 'mainnet' : null
  const c = net ? CONTRACTS[net] : null
  const allowed = new Set<string>(
    c ? [c.soroswap.router, c.soroswap.factory, c.tokens.usdcSac, c.tokens.xlmSac].filter(Boolean) : [],
  )

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
    // destination must be the trader, or an xdr could stay under the cap and pay
    // the broker. a muxed address never equals the G address, so it fails closed.
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
      // the cap can't sum a spend hidden in contract args, so a capped trade has to
      // go through path payments.
      if (maxSpendStroops !== undefined) {
        throw new BrokerTxRejected('a soroban invoke is not bound by the spend cap; route through path payments')
      }
    }
    // sendMax is a ceiling, so a strict-receive counts at its worst case.
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
