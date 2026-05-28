import {
  Contract,
  TransactionBuilder,
  BASE_FEE,
  Address,
  Networks,
  xdr,
  scValToNative,
  rpc,
} from '@stellar/stellar-sdk'

import { CONTRACTS } from '../../config/contracts'
import { getSorobanServer, networkPassphrase } from './client'
import type { FactoryInfo, LobsterPool, Network } from './types'

const POLL_INTERVAL_MS = 3_000
const POLL_TIMEOUT_MS = 60_000

function getFactoryId(network: Network): string {
  const id = CONTRACTS[network].lobster.factory
  if (!id) {
    throw new Error(`Lobster Factory not deployed on ${network} yet`)
  }
  return id
}

async function readContract<T = unknown>(
  network: Network,
  account: string,
  method: string,
  args: xdr.ScVal[] = [],
): Promise<T> {
  const server = getSorobanServer(network)
  const factory = new Contract(getFactoryId(network))
  const sourceAccount = await server.getAccount(account)
  const tx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase(network),
  })
    .addOperation(factory.call(method, ...args))
    .setTimeout(30)
    .build()

  const sim = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`Factory.${method} simulation failed: ${sim.error}`)
  }
  if (!sim.result) {
    throw new Error(`Factory.${method} returned no result`)
  }
  return scValToNative(sim.result.retval) as T
}

function readSource(network: Network, override?: string): string {
  if (override) return override
  const src = CONTRACTS[network].lobster.readSource
  if (src) return src
  throw new Error('readSource: pass the wallet address for mainnet reads')
}

export async function getFactoryInfo(
  network: Network,
  callerAccount?: string,
): Promise<FactoryInfo> {
  const source = readSource(network, callerAccount)
  const [admin, wasmHashBytes, poolCountBig] = await Promise.all([
    readContract<string>(network, source, 'get_admin'),
    readContract<Uint8Array>(network, source, 'get_wasm_hash'),
    readContract<bigint>(network, source, 'get_pool_count'),
  ])
  return {
    admin: admin,
    wasmHash: Buffer.from(wasmHashBytes).toString('hex'),
    poolCount: Number(poolCountBig),
  }
}

export async function getPoolsByUser(
  network: Network,
  user: string,
  callerAccount?: string,
): Promise<LobsterPool[]> {
  const server = getSorobanServer(network)
  // freshly imported wallets on mainnet 404 on getAccount before
  // simulation. no pools to read in that case; return [] instead of
  // crashing the UI.
  let source: string
  try {
    source = readSource(network, callerAccount || user)
    await server.getAccount(source)
  } catch (err) {
    if (err instanceof Error && /not found|404/i.test(err.message)) return []
    if (err && typeof err === 'object' && 'response' in err) {
      const r = (err as { response?: { status?: number } }).response
      if (r?.status === 404) return []
    }
    throw err
  }

  const raw = await readContract<Array<{
    lobster_address: string
    owner: string
    token0: string
    token1: string
  }>>(network, source, 'get_pools_by_user', [
    new Address(user).toScVal(),
  ])

  return raw.map((p) => ({
    lobsterAddress: p.lobster_address,
    owner: p.owner,
    token0: p.token0,
    token1: p.token1,
  }))
}

// Pull the restorePreamble type out of the union variant so the rest of
// the code keeps full type safety on the field.
export type SorobanRestorePreamble = Extract<
  Awaited<ReturnType<rpc.Server['simulateTransaction']>>,
  { restorePreamble: unknown }
>['restorePreamble']

export class RestoreRequiredError extends Error {
  readonly preamble: SorobanRestorePreamble
  constructor(preamble: SorobanRestorePreamble) {
    super('Factory storage entries are archived. Submit the restore tx first.')
    this.name = 'RestoreRequiredError'
    this.preamble = preamble
  }
}

export async function buildPingTx(
  network: Network,
  fromAddress: string,
): Promise<string> {
  const server = getSorobanServer(network)
  const factory = new Contract(getFactoryId(network))
  const source = await server.getAccount(fromAddress)
  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase(network),
  })
    .addOperation(factory.call('get_admin'))
    .setTimeout(60)
    .build()

  const sim = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`Ping tx simulation failed: ${sim.error}`)
  }
  if (rpc.Api.isSimulationRestore(sim)) {
    throw new RestoreRequiredError(sim.restorePreamble)
  }
  const prepared = rpc.assembleTransaction(tx, sim).build()
  return prepared.toXDR()
}

export class TryAgainLaterError extends Error {
  constructor(message = 'Soroban RPC asked us to retry. Resubmit the same XDR in a few seconds.') {
    super(message)
    this.name = 'TryAgainLaterError'
  }
}

// exported so the unit test can hit it without rebuilding a full XDR
export function handleSendResult(
  sent: { status: string; hash: string; errorResult?: unknown },
): string {
  switch (sent.status) {
    case 'PENDING':
    case 'DUPLICATE':
      return sent.hash
    case 'TRY_AGAIN_LATER':
      throw new TryAgainLaterError()
    case 'ERROR':
      throw new Error(
        `sendTransaction rejected: ${JSON.stringify(sent.errorResult ?? sent)}`,
      )
    default:
      throw new Error(`Unknown sendTransaction status: ${String(sent.status)}`)
  }
}

export async function submitSignedXdr(
  network: Network,
  signedXdr: string,
): Promise<string> {
  const server = getSorobanServer(network)
  const passphrase = networkPassphrase(network)
  const tx = TransactionBuilder.fromXDR(signedXdr, passphrase)
  const sent = await server.sendTransaction(tx)
  return handleSendResult(sent)
}

export async function waitForTx(network: Network, hash: string): Promise<rpc.Api.GetTransactionResponse> {
  const server = getSorobanServer(network)
  const start = Date.now()
  while (Date.now() - start < POLL_TIMEOUT_MS) {
    const res = await server.getTransaction(hash)
    if (res.status !== 'NOT_FOUND') return res
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
  }
  throw new Error(`Timed out waiting for tx ${hash} (${POLL_TIMEOUT_MS / 1000}s)`)
}

export { Networks }
