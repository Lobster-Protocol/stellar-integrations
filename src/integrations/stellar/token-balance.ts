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

// reads a soroban token balance via the SAC balance() view. returns null on any
// failure (never held it, bad id, rpc down) so callers can append it without
// ever breaking the classic balance list.
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
