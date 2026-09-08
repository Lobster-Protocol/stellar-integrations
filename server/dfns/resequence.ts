import { TransactionBuilder, Horizon, Networks, type Transaction, type Account } from '@stellar/stellar-sdk'
import { STELLAR_RPC_FALLBACK, type Network } from '../../src/config/contracts'

// dfns signs and broadcasts a kind:Transaction envelope verbatim, with the
// sequence baked in at build time, and only after an approval hold that can run
// minutes. rebuild the same ops on a fresh sequence so a value that was current
// at the click is not stale when dfns finally submits it. this closes the
// build->broadcast window; a tx held for approval while the account is used
// elsewhere can still race, which is why the treasury signs one op at a time.
export function rebuildWithSequence(tx: Transaction, account: Account, passphrase: string): Transaction {
  // a soroban envelope carries its footprint and resource budget in the tx
  // extension, and a fresh builder starts without one. copying the operations
  // alone produced an invokeHostFunction declaring no resources, which the
  // network rejects as malformed.
  const ext = tx.toEnvelope().v1().tx().ext()
  const sorobanData = ext.switch() === 1 ? ext.sorobanData() : null
  // the builder adds the resource fee back when it sees the soroban data, and
  // tx.fee already includes it, so hand over the inclusion part alone or the
  // resource fee gets counted twice.
  const resourceFee = sorobanData ? BigInt(sorobanData.resourceFee().toString()) : 0n
  const inclusion = BigInt(tx.fee) - resourceFee
  const builder = new TransactionBuilder(account, {
    fee: (inclusion > 0n ? inclusion : BigInt(tx.fee)).toString(),
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
