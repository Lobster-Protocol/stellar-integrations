import { TransactionBuilder, Operation, Asset, BASE_FEE } from '@stellar/stellar-sdk'

import { CONTRACTS, type Network } from '../../config/contracts'
import { getHorizonServer } from '../horizon/client'
import { networkPassphrase } from '../lobster/client'

// a classic self-payment the DFNS-held treasury signs to demonstrate MPC
// custody. it is a real on-chain tx, a payment op the relay sign guard allows
// (unlike a soroban call, which the guard blocks to stop a treasury drain), and
// it carries an amount DFNS can weigh against its approval policy. destination
// is the treasury itself, so no value leaves the account. a larger amount is
// what pushes the same flow over the policy limit into the second-approver path.
export async function buildTreasuryPaymentTx(
  network: Network,
  treasury: string,
  amountXlm: string,
): Promise<string> {
  const server = getHorizonServer(network)
  const account = await server.loadAccount(treasury)
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase(network),
  })
    .addOperation(
      Operation.payment({ destination: treasury, asset: Asset.native(), amount: amountXlm }),
    )
    .setTimeout(180)
    .build()
  return tx.toXDR()
}

// a changeTrust the DFNS-held treasury signs to open a trustline for the Lobster
// classic token. changeTrust moves no value out - it is the prerequisite op a
// treasury runs before it can hold an asset, which the relay guard now allows.
// proves the MPC can sign a classic non-payment op (the tranche's trustline case).
export async function buildTreasuryTrustlineTx(
  network: Network,
  treasury: string,
): Promise<string> {
  const { code, issuer } = CONTRACTS[network].lobsAsset
  if (!issuer) throw new Error(`no trustline demo asset configured on ${network}`)
  const server = getHorizonServer(network)
  const account = await server.loadAccount(treasury)
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase(network),
  })
    .addOperation(Operation.changeTrust({ asset: new Asset(code, issuer) }))
    .setTimeout(180)
    .build()
  return tx.toXDR()
}
