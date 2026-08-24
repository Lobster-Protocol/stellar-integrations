import { TransactionBuilder, Horizon, Networks, type Transaction, type Account } from '@stellar/stellar-sdk'
import { STELLAR_RPC_FALLBACK, type Network } from '../../src/config/contracts'

// dfns signs and broadcasts a kind:Transaction envelope verbatim, with the
// sequence baked in at build time, and only after an approval hold that can run
// minutes. rebuild the same ops on a fresh sequence so a value that was current
// at the click is not stale when dfns finally submits it. this closes the
// build->broadcast window; a tx held for approval while the account is used
// elsewhere can still race, which is why the treasury signs one op at a time.
export function rebuildWithSequence(tx: Transaction, account: Account, passphrase: string): Transaction {
  const builder = new TransactionBuilder(account, { fee: tx.fee.toString(), networkPassphrase: passphrase })
  for (const op of tx.toEnvelope().v1().tx().operations()) builder.addOperation(op)
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
