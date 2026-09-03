import { TransactionBuilder, Operation, Asset, BASE_FEE, NotFoundError } from '@stellar/stellar-sdk'

import { CONTRACTS, type Network } from '../../config/contracts'
import { getHorizonServer } from '../horizon/client'
import { networkPassphrase } from '../lobster/client'

// a quorum approval is a human step, so the tx must still be valid when dfns
// broadcasts it minutes later. both demo txs carry the same wide window.
const APPROVAL_WINDOW_SECONDS = 3600

// the treasury pays itself: no value leaves, but it is a real payment op the
// relay guard allows and dfns can weigh against its approval policy.
export async function buildTreasuryPaymentTx(
  network: Network,
  treasury: string,
  amountXlm: string,
): Promise<string> {
  const server = getHorizonServer(network)
  let account
  try {
    account = await server.loadAccount(treasury)
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw new Error(
        `This wallet is not funded on ${network} yet. Add some XLM (use friendbot on testnet) first.`,
      )
    }
    throw err
  }
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase(network),
  })
    .addOperation(
      Operation.payment({ destination: treasury, asset: Asset.native(), amount: amountXlm }),
    )
    .setTimeout(APPROVAL_WINDOW_SECONDS)
    .build()
  return tx.toXDR()
}

// changeTrust proves the MPC can sign a classic non-payment op; it opens a LOBS
// trustline on the treasury and moves no value.
export async function buildTreasuryTrustlineTx(
  network: Network,
  treasury: string,
): Promise<string> {
  const { code, issuer } = CONTRACTS[network].lobsAsset
  if (!issuer) throw new Error(`no trustline demo asset configured on ${network}`)
  const server = getHorizonServer(network)
  let account
  try {
    account = await server.loadAccount(treasury)
  } catch (err) {
    if (err instanceof NotFoundError) {
      throw new Error(
        `This wallet is not funded on ${network} yet. Add some XLM (use friendbot on testnet) first.`,
      )
    }
    throw err
  }
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase(network),
  })
    .addOperation(Operation.changeTrust({ asset: new Asset(code, issuer) }))
    .setTimeout(APPROVAL_WINDOW_SECONDS)
    .build()
  return tx.toXDR()
}
