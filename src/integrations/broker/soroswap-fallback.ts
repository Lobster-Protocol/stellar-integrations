import {
  Contract,
  TransactionBuilder,
  BASE_FEE,
  Address,
  nativeToScVal,
  scValToNative,
  rpc,
  xdr,
} from '@stellar/stellar-sdk'

import { CONTRACTS, type Network } from '../../config/contracts'
import { getSorobanServer, networkPassphrase } from '../lobster/client'
import { RestoreRequiredError } from '../lobster/factory'
import { assertAccountId, assertContractId } from '../stellar/strkey-guards'

export interface SoroswapQuoteParams {
  network: Network
  callerAccount: string
  sellingTokenId: string
  buyingTokenId: string
  amountInStroops: bigint
}

// direct soroswap router invoke when the broker has no quote. uses
// router_get_amounts_out via simulate. last element of the returned
// Vec<i128> is the expected output. null on any failure (no pair,
// missing router, account 404, simulation error).
export async function quoteSoroswapDirect(
  params: SoroswapQuoteParams,
): Promise<bigint | null> {
  const routerId = CONTRACTS[params.network].soroswap.router
  if (!routerId) return null

  try {
    assertContractId(routerId)
    assertContractId(params.sellingTokenId)
    assertContractId(params.buyingTokenId)
    assertAccountId(params.callerAccount)
  } catch {
    // bad caller or token id, no point hitting rpc
    return null
  }

  const server = getSorobanServer(params.network)
  let sourceAccount
  try {
    sourceAccount = await server.getAccount(params.callerAccount)
  } catch {
    // caller not on-chain yet on this network
    return null
  }

  const router = new Contract(routerId)
  const amountIn = nativeToScVal(params.amountInStroops, { type: 'i128' })
  const path = xdr.ScVal.scvVec([
    Address.fromString(params.sellingTokenId).toScVal(),
    Address.fromString(params.buyingTokenId).toScVal(),
  ])

  const tx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase(params.network),
  })
    .addOperation(router.call('router_get_amounts_out', amountIn, path))
    .setTimeout(30)
    .build()

  const sim = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(sim)) return null
  if (!sim.result) return null

  const amounts = scValToNative(sim.result.retval) as bigint[]
  return amounts.length > 0 ? amounts[amounts.length - 1] : null
}

export interface SoroswapBuildParams extends SoroswapQuoteParams {
  minAmountOut: bigint
  deadlineUnix: number
}

// builds the prepared swap_exact_tokens_for_tokens xdr, ready to sign.
// the caller submits the signed envelope via the lobster factory helpers
// (submitSignedXdr + waitForTx) since they already handle the polling.
export async function buildSoroswapSwapTx(params: SoroswapBuildParams): Promise<string> {
  const routerId = CONTRACTS[params.network].soroswap.router
  if (!routerId) throw new Error('soroswap router not configured for this network')
  assertContractId(routerId)
  assertContractId(params.sellingTokenId)
  assertContractId(params.buyingTokenId)
  assertAccountId(params.callerAccount)
  // a zero min_out would let the pool fill us at any price. dust quotes
  // can floor to 0 after the slippage haircut, so refuse them here.
  if (params.minAmountOut <= 0n) throw new Error('soroswap swap needs a positive min amount out')

  const server = getSorobanServer(params.network)
  const source = await server.getAccount(params.callerAccount)
  const router = new Contract(routerId)

  const amountIn = nativeToScVal(params.amountInStroops, { type: 'i128' })
  const minOut = nativeToScVal(params.minAmountOut, { type: 'i128' })
  const path = xdr.ScVal.scvVec([
    Address.fromString(params.sellingTokenId).toScVal(),
    Address.fromString(params.buyingTokenId).toScVal(),
  ])
  const to = Address.fromString(params.callerAccount).toScVal()
  const deadline = nativeToScVal(BigInt(params.deadlineUnix), { type: 'u64' })

  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase(params.network),
  })
    .addOperation(router.call('swap_exact_tokens_for_tokens', amountIn, minOut, path, to, deadline))
    .setTimeout(180)
    .build()

  const sim = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(sim)) {
    throw new Error(`soroswap sim failed: ${sim.error}`)
  }
  if (rpc.Api.isSimulationRestore(sim)) {
    throw new RestoreRequiredError(sim.restorePreamble)
  }
  const prepared = rpc.assembleTransaction(tx, sim).build()
  return prepared.toXDR()
}
