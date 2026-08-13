import {
  Contract,
  TransactionBuilder,
  BASE_FEE,
  Address,
  scValToNative,
  rpc,
} from '@stellar/stellar-sdk'

import type { Network } from '../../config/contracts'
import { getSorobanServer, networkPassphrase } from '../lobster/client'
import { isContractId, isAccountId } from './strkey-guards'

// reads one account's balance of a soroban token through the SAC balance()
// view. testnet USDC is a soroban-only asset, so Horizon never lists it - this
// is how a user sees the USDC they just swapped into. returns null on any
// failure (never held it, bad id, rpc down) so it can sit beside the classic
// balance list without ever breaking it.
export async function getSorobanTokenBalance(
  network: Network,
  tokenId: string,
  account: string,
): Promise<bigint | null> {
  if (!isContractId(tokenId) || !isAccountId(account)) return null

  try {
    const server = getSorobanServer(network)
    const source = await server.getAccount(account)
    const tx = new TransactionBuilder(source, {
      fee: BASE_FEE,
      networkPassphrase: networkPassphrase(network),
    })
      .addOperation(new Contract(tokenId).call('balance', new Address(account).toScVal()))
      .setTimeout(30)
      .build()

    const sim = await server.simulateTransaction(tx)
    if (rpc.Api.isSimulationError(sim) || !sim.result) return null
    const raw = scValToNative(sim.result.retval) as bigint
    return typeof raw === 'bigint' && raw > 0n ? raw : null
  } catch {
    return null
  }
}
