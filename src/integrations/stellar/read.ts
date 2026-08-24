import {
  Contract,
  TransactionBuilder,
  BASE_FEE,
  scValToNative,
  rpc,
  xdr,
} from '@stellar/stellar-sdk'

import type { Network } from '../../config/contracts'
import { getSorobanServer, networkPassphrase } from '../lobster/client'

export class ContractReadError extends Error {
  readonly method: string
  constructor(method: string, detail: string) {
    super(`${method}: ${detail}`)
    this.name = 'ContractReadError'
    this.method = method
  }
}

// a contract view is read by simulating the call from an account that never
// signs, so any funded account on the network will do.
export async function simulateRead<T>(
  network: Network,
  source: string,
  contractId: string,
  method: string,
  args: xdr.ScVal[] = [],
): Promise<T> {
  const server = getSorobanServer(network)
  const account = await server.getAccount(source)
  const tx = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase(network),
  })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build()

  const sim = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(sim)) throw new ContractReadError(method, sim.error)
  if (rpc.Api.isSimulationRestore(sim)) throw new ContractReadError(method, 'entry archived')
  if (!sim.result) throw new ContractReadError(method, 'no value returned')
  return scValToNative(sim.result.retval) as T
}

// the vault panics with a numbered contract error when it has no active
// position. callers need to tell that apart from an rpc failure.
export function contractErrorCode(err: unknown): number | null {
  if (!(err instanceof Error)) return null
  const m = /Error\(Contract, ?#(\d+)\)/.exec(err.message)
  return m ? Number(m[1]) : null
}
