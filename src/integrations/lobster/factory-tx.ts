import { Contract, TransactionBuilder, BASE_FEE, Address, rpc } from '@stellar/stellar-sdk'

import { getSorobanServer, networkPassphrase, loadFunded } from './client'
import { submitSignedXdr, waitForTx, type SorobanRestorePreamble } from './factory'
import { CONTRACTS, type Network } from '../../config/contracts'

// create_pool deploys a fresh vault owned by the caller for a token pair. It runs
// caller.require_auth and takes no other trusted address, so unlike the liquidity
// paths there is no caller-supplied router to drain through.
export async function buildCreatePoolTx(
  network: Network,
  caller: string,
  token0Sac: string,
  token1Sac: string,
): Promise<{ xdr: string; restorePreamble?: SorobanRestorePreamble }> {
  const factoryId = CONTRACTS[network].lobster.factory
  if (!factoryId) throw new Error(`Lobster Factory not deployed on ${network} yet`)

  const server = getSorobanServer(network)
  const factory = new Contract(factoryId)
  const source = await loadFunded(server, caller, network)

  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase(network),
  })
    .addOperation(
      factory.call(
        'create_pool',
        new Address(caller).toScVal(),
        new Address(token0Sac).toScVal(),
        new Address(token1Sac).toScVal(),
      ),
    )
    .setTimeout(60)
    .build()

  const sim = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(sim)) throw new Error(sim.error)
  if (rpc.Api.isSimulationRestore(sim)) return { xdr: '', restorePreamble: sim.restorePreamble }
  const prepared = rpc.assembleTransaction(tx, sim).build()
  return { xdr: prepared.toXDR() }
}

export { submitSignedXdr, waitForTx }
