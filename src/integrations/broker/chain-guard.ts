import {
  TransactionBuilder,
  FeeBumpTransaction,
  Networks,
  Address,
  type Transaction,
  type Operation,
} from '@stellar/stellar-sdk'

import { CONTRACTS, type Network } from '../../config/contracts'

// ops the broker is allowed to push as part of a swap. a plain payment
// is not here: a real swap settles via path payments or Soroban router
// calls, never a bare payment to an arbitrary destination. allowing it
// would let a hostile broker XDR drain the trader for the full balance.
const ALLOWED_OP_TYPES = new Set([
  'pathPaymentStrictReceive',
  'pathPaymentStrictSend',
  'manageSellOffer',
  'manageBuyOffer',
  'createPassiveSellOffer',
  'invokeHostFunction',
])

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
export function inspectBrokerTx(xdr: string, traderAccount: string, networkPassphrase: string): void {
  let tx: Transaction | FeeBumpTransaction
  try {
    tx = TransactionBuilder.fromXDR(xdr, networkPassphrase)
  } catch (err) {
    throw new BrokerTxRejected(`broker pushed an invalid xdr: ${(err as Error).message}`)
  }

  const inner = tx instanceof FeeBumpTransaction ? tx.innerTransaction : tx
  if (inner.source !== traderAccount) {
    throw new BrokerTxRejected(
      `tx source ${inner.source} does not match trader ${traderAccount}`,
    )
  }

  const net = networkFromPassphrase(networkPassphrase)
  const allowed = net ? sorobanAllowlist(net) : new Set<string>()

  for (const op of inner.operations) {
    if (!ALLOWED_OP_TYPES.has(op.type)) {
      throw new BrokerTxRejected(`op type ${op.type} is not allowed in a swap envelope`)
    }
    if (op.source && op.source !== traderAccount) {
      throw new BrokerTxRejected(
        `op type ${op.type} sources ${op.source}, not the trader ${traderAccount}`,
      )
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
    }
  }
}
