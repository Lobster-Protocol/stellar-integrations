import {
  Contract,
  TransactionBuilder,
  BASE_FEE,
  Address,
  nativeToScVal,
  rpc,
} from '@stellar/stellar-sdk'

import { getSorobanServer, networkPassphrase, loadFunded } from './client'
import { submitSignedXdr, waitForTx, type SorobanRestorePreamble } from './factory'
import { decimalToStroops } from '../stellar/amount'
import type { Network } from './types'

export type VaultAction = 'deposit' | 'withdraw'

// deposit pulls token0/token1 from the caller into the vault; withdraw_contract
// sends the vault's own token0/token1 back to its owner. Both take the same
// (caller, amount0, amount1) shape, so one builder covers both.
const METHOD: Record<VaultAction, string> = {
  deposit: 'deposit',
  withdraw: 'withdraw_contract',
}

export async function buildVaultActionTx(
  network: Network,
  vaultAddress: string,
  action: VaultAction,
  caller: string,
  amount0: string,
  amount1: string,
): Promise<{ xdr: string; restorePreamble?: SorobanRestorePreamble }> {
  const server = getSorobanServer(network)
  const vault = new Contract(vaultAddress)
  const source = await loadFunded(server, caller, network)

  const args = [
    new Address(caller).toScVal(),
    nativeToScVal(decimalToStroops(amount0), { type: 'i128' }),
    nativeToScVal(decimalToStroops(amount1), { type: 'i128' }),
  ]

  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase(network),
  })
    .addOperation(vault.call(METHOD[action], ...args))
    .setTimeout(60)
    .build()

  const sim = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(sim.error)
  }
  // archived vault storage hands back the preamble; the caller restores first.
  // caller == owner, so the single envelope signature covers the token auth.
  if (rpc.Api.isSimulationRestore(sim)) {
    return { xdr: '', restorePreamble: sim.restorePreamble }
  }
  const prepared = rpc.assembleTransaction(tx, sim).build()
  return { xdr: prepared.toXDR() }
}

export { submitSignedXdr, waitForTx }
