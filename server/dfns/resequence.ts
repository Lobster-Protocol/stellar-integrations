import { TransactionBuilder, Horizon, Networks, type Transaction, type Account } from '@stellar/stellar-sdk'
import { STELLAR_RPC_FALLBACK, type Network } from '../../src/config/contracts'

// dfns signs and broadcasts a kind:Transaction envelope verbatim, with the
// sequence baked in at build time, and only after an approval hold that can run
// minutes. rebuild the same ops on a fresh sequence so a value that was current
// at the click is not stale when dfns finally submits it. this closes the
// build->broadcast window; a tx held for approval while the account is used
// elsewhere can still race, which is why the treasury signs one tx at a time.
export function rebuildWithSequence(tx: Transaction, account: Account, passphrase: string): Transaction {
  // the footprint and resource budget sit in the tx extension, not in the ops, and
  // an invokeHostFunction without them is rejected as malformed.
  const ext = tx.toEnvelope().v1().tx().ext()
  const sorobanData = ext.switch() === 1 ? ext.sorobanData() : null
  // tx.fee already includes the resource fee and build() adds it again from the
  // soroban data, so the builder gets the inclusion fee alone.
  const resourceFee = sorobanData ? BigInt(sorobanData.resourceFee().toString()) : 0n
  const inclusion = BigInt(tx.fee) - resourceFee
  // build() also multiplies that fee by the op count, so the builder gets the
  // per-op share, rounded up so the rebuilt total is never below the original.
  const opCount = BigInt(Math.max(tx.operations.length, 1))
  const perOp = ((inclusion > 0n ? inclusion : BigInt(tx.fee)) + opCount - 1n) / opCount
  const builder = new TransactionBuilder(account, {
    fee: perOp.toString(),
    networkPassphrase: passphrase,
  })
  for (const op of tx.toEnvelope().v1().tx().operations()) builder.addOperation(op)
  if (sorobanData) builder.setSorobanData(sorobanData)
  if (tx.timeBounds) {
    builder.setTimebounds(Number(tx.timeBounds.minTime), Number(tx.timeBounds.maxTime))
  } else {
    builder.setTimeout(3600)
  }
  return builder.build()
}

export async function reSequence(tx: Transaction, passphrase: string): Promise<Transaction> {
  const network: Network = passphrase === Networks.PUBLIC ? 'mainnet' : 'testnet'
  const url =
    (network === 'mainnet' ? process.env.HORIZON_MAINNET : process.env.HORIZON_TESTNET) ||
    STELLAR_RPC_FALLBACK[network].horizon
  const server = new Horizon.Server(url, { allowHttp: url.startsWith('http://') })
  const account = await server.loadAccount(tx.source)
  return rebuildWithSequence(tx, account, passphrase)
}
