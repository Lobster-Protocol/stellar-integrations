import { Address, Contract, TransactionBuilder, nativeToScVal, rpc, type xdr } from '@stellar/stellar-sdk'
import { formatUnits, getAddress, isAddress } from 'viem'

import { getSorobanServer, loadFunded, networkPassphrase } from '../lobster/client'
import { submitSignedXdr, waitForTx } from '../lobster/factory'
import { simulateRead } from '../stellar/read'
import type { Signer } from '../signer/types'
import {
  CCTP_EVM_USDC_DECIMALS,
  CCTP_FINALITY,
  CCTP_STELLAR_USDC_DECIMALS,
  CONTRACTS,
  INCLUSION_FEE_STROOPS,
  type CctpSourceChain,
  type Network,
} from '../../config/contracts'
import { toEvmUsdcUnits, UserRejectedError } from './evm-burn'

export class StellarBurnError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'StellarBurnError'
  }
}

// Circle's forwarding service, version 0: "cctp-forward" then zeros, 32 bytes. Read
// from the burn, it asks Circle to mint on the EVM chain itself
export const FORWARD_REQUEST_HOOK = (() => {
  const out = new Uint8Array(32)
  out.set(new TextEncoder().encode('cctp-forward'))
  return out
})()

// CCTP carries 6 decimals and Stellar's USDC has 7, so a 7th decimal could not
// cross: refused here rather than dropped by Circle's converter
export function toStellarUsdcUnits(human: string): bigint {
  const decimals = human.trim().split('.')[1]?.length ?? 0
  if (decimals > CCTP_EVM_USDC_DECIMALS) {
    throw new StellarBurnError(`The bridge carries USDC to ${CCTP_EVM_USDC_DECIMALS} decimals, not ${decimals}`)
  }
  return toEvmUsdcUnits(human) * 10n ** BigInt(CCTP_STELLAR_USDC_DECIMALS - CCTP_EVM_USDC_DECIMALS)
}

// Stellar's 7-decimal units back to the 6 the EVM side and Circle's messages use
export function stellarToEvmUnits(units: bigint): bigint {
  return units / 10n ** BigInt(CCTP_STELLAR_USDC_DECIMALS - CCTP_EVM_USDC_DECIMALS)
}

// Horizon gives balances as 7-decimal strings; read as text, never through a float
export function stellarBalanceUnits(balance: string): bigint {
  const [whole, frac = ''] = balance.trim().split('.')
  if (!/^\d+$/.test(whole || '0') || !/^\d*$/.test(frac)) return 0n
  return BigInt(whole || '0') * 10n ** BigInt(CCTP_STELLAR_USDC_DECIMALS) + BigInt((frac + '0000000').slice(0, CCTP_STELLAR_USDC_DECIMALS))
}

// the most a balance can send, its 7th decimal left behind
export function sendableAmount(units: bigint): string {
  return formatUnits(stellarToEvmUnits(units), CCTP_EVM_USDC_DECIMALS)
}

// an EVM address takes the low 20 bytes of a bytes32, as mintRecipient expects
export function evmAddressToBytes32(address: string): Uint8Array {
  if (!isAddress(address, { strict: false })) throw new StellarBurnError(`'${address}' is not an EVM address`)
  const raw = getAddress(address).slice(2)
  const out = new Uint8Array(32)
  for (let i = 0; i < 20; i++) out[12 + i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16)
  return out
}

function isRejection(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err ?? '')
  return /declin|reject|denied|cancel/i.test(text)
}

// a soroban call signed by the connected Stellar wallet: one call per transaction,
// simulated first so a refusal reads as Stellar's reason, not a wallet error
async function invokeSigned(
  network: Network,
  owner: string,
  signer: Signer,
  what: string,
  op: xdr.Operation,
  onSent?: (hash: string) => void,
): Promise<string> {
  const server = getSorobanServer(network)
  const source = await loadFunded(server, owner, network)
  const tx = new TransactionBuilder(source, { fee: INCLUSION_FEE_STROOPS, networkPassphrase: networkPassphrase(network) })
    .addOperation(op)
    .setTimeout(180)
    .build()
  const sim = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(sim)) {
    throw new StellarBurnError(`Stellar would refuse the ${what}: ${explainBurnFailure(sim.error)}`)
  }
  const xdrOut = rpc.assembleTransaction(tx, sim).build().toXDR()
  let signed
  try {
    signed = await signer.signTransaction(xdrOut, { networkPassphrase: networkPassphrase(network), address: owner })
  } catch (err) {
    if (isRejection(err)) throw new UserRejectedError()
    throw err
  }
  if (!signed.signedTxXdr) throw new StellarBurnError('The wallet did not return a signed transaction')
  const hash = await submitSignedXdr(network, signed.signedTxXdr)
  onSent?.(hash)
  const res = await waitForTx(network, hash)
  if (res.status !== 'SUCCESS') throw new StellarBurnError(`The ${what} failed on Stellar (${hash})`)
  return hash
}

// Circle's TokenMessengerMinter (71xx, 1000 for a pause) and the USDC token (1 to 13)
// fail with bare numbers; these are the ones a person can act on
const BURN_FAILURES: Record<string, string> = {
  '9': 'the USDC allowance for Circle is missing or too low',
  '10': 'this account does not hold that much USDC',
  '11': "this account's USDC is frozen by its issuer",
  '13': 'this account has no USDC trustline',
  '1000': 'Circle has paused the bridge on Stellar for now',
  '7104': "Circle's fee would swallow the whole amount",
  '7105': "the fee allowed is below Circle's minimum",
  '7106': 'Circle does not carry USDC from Stellar to that chain',
  '7118': 'the amount is too small to bridge',
  '7119': 'the amount has a decimal Circle cannot carry',
}

export function explainBurnFailure(raw: string): string {
  const code = /Error\(Contract, #(\d+)\)/.exec(raw)?.[1]
  return (code && BURN_FAILURES[code]) || raw.split('\n')[0]
}

// what Circle's TokenMessengerMinter may still pull from this account
export async function readStellarAllowance(network: Network, owner: string): Promise<bigint> {
  const { usdcSac, tokenMessengerMinter } = CONTRACTS[network].cctp
  const raw = await simulateRead<bigint>(network, CONTRACTS[network].lobster.readSource, usdcSac, 'allowance', [
    new Address(owner).toScVal(),
    new Address(tokenMessengerMinter).toScVal(),
  ])
  return BigInt(raw)
}

// about an hour and a half of ledgers: long enough to sign the burn, short enough
// that an approval left unused lapses on its own
const APPROVAL_LEDGERS = 1_000

// exact amount, never more: the TokenMessengerMinter pulls the USDC with transfer_from
export async function approveForBurn(opts: {
  network: Network
  owner: string
  units: bigint
  signer: Signer
}): Promise<string> {
  const { network, owner, units, signer } = opts
  const { usdcSac, tokenMessengerMinter } = CONTRACTS[network].cctp
  const latest = await getSorobanServer(network).getLatestLedger()
  const op = new Contract(usdcSac).call(
    'approve',
    new Address(owner).toScVal(),
    new Address(tokenMessengerMinter).toScVal(),
    nativeToScVal(units, { type: 'i128' }),
    nativeToScVal(latest.sequence + APPROVAL_LEDGERS, { type: 'u32' }),
  )
  return invokeSigned(network, owner, signer, 'approval', op)
}

export interface StellarBurnRequest {
  network: Network
  // the Stellar account that holds the USDC and signs
  owner: string
  // 7-decimal units
  units: bigint
  // the EVM chain the USDC goes to
  chain: CctpSourceChain
  evmRecipient: string
  // ask Circle to mint on the EVM chain itself, for the fee in maxFee
  forward: boolean
  // 7-decimal units, taken from the amount; 0 when the recipient mints it
  maxFee: bigint
}

// split out so where the money goes can be tested without a wallet
export function stellarBurnArgs(req: StellarBurnRequest): xdr.ScVal[] {
  const { usdcSac } = CONTRACTS[req.network].cctp
  const args = [
    new Address(req.owner).toScVal(),
    nativeToScVal(req.units, { type: 'i128' }),
    nativeToScVal(req.chain.domain, { type: 'u32' }),
    nativeToScVal(Buffer.from(evmAddressToBytes32(req.evmRecipient)), { type: 'bytes' }),
    new Address(usdcSac).toScVal(),
    // any address may mint it, so the recipient's own wallet can when Circle does not
    nativeToScVal(Buffer.alloc(32), { type: 'bytes' }),
    nativeToScVal(req.maxFee, { type: 'i128' }),
    // Stellar finalises in seconds; Circle offers no fast tier from it
    nativeToScVal(CCTP_FINALITY.standard, { type: 'u32' }),
  ]
  if (req.forward) args.push(nativeToScVal(Buffer.from(FORWARD_REQUEST_HOOK), { type: 'bytes' }))
  return args
}

// onSent hears the hash the moment the burn is submitted, before Stellar confirms it
export async function burnFromStellar(
  req: StellarBurnRequest & { signer: Signer },
  onSent?: (hash: string) => void,
): Promise<string> {
  if (req.maxFee >= req.units) throw new StellarBurnError("Circle's fee would swallow the whole amount")
  const { tokenMessengerMinter } = CONTRACTS[req.network].cctp
  const op = new Contract(tokenMessengerMinter).call(
    req.forward ? 'deposit_for_burn_with_hook' : 'deposit_for_burn',
    ...stellarBurnArgs(req),
  )
  return invokeSigned(req.network, req.owner, req.signer, 'burn', op, onSent)
}
