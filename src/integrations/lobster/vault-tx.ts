import {
  Contract,
  TransactionBuilder,
  Address,
  nativeToScVal,
  rpc,
} from '@stellar/stellar-sdk'

import { getSorobanServer, networkPassphrase, loadFunded } from './client'
import { submitSignedXdr, waitForTx, type SorobanRestorePreamble } from './factory'
import { decimalToStroops } from '../stellar/amount'
import type { Network } from './types'
import { INCLUSION_FEE_STROOPS } from '../../config/contracts'

export type VaultAction = 'deposit' | 'withdraw'

// withdraw_contract sends the vault's own token0/token1 back to its owner, and takes
// the same (caller, amount0, amount1) as deposit, so one builder covers both
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
  // multisig owners pass more so the quorum signs before tx_too_late
  timeoutSecs = 60,
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
    fee: INCLUSION_FEE_STROOPS,
    networkPassphrase: networkPassphrase(network),
  })
    .addOperation(vault.call(METHOD[action], ...args))
    .setTimeout(timeoutSecs)
    .build()

  // caller == owner, so the one envelope signature covers the token auth too
  const sim = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(sim.error)
  }
  if (rpc.Api.isSimulationRestore(sim)) {
    return { xdr: '', restorePreamble: sim.restorePreamble }
  }
  const prepared = rpc.assembleTransaction(tx, sim).build()
  return { xdr: prepared.toXDR() }
}

export { submitSignedXdr, waitForTx }
