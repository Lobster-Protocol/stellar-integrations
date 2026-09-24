import {
  Account,
  Asset,
  Contract,
  Horizon,
  Keypair,
  Networks,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
} from '@stellar/stellar-sdk'

import {
  CONTRACTS,
  INCLUSION_FEE_STROOPS,
  STELLAR_CCTP_DOMAIN,
  STELLAR_RPC_FALLBACK,
  type Network,
} from '../../src/config/contracts'
import { fetchAttestation } from '../../src/integrations/cctp/iris'
import {
  amountToLand,
  assertAttestation,
  assertMessageMatches,
  decodeCctpMessage,
  hexToBytes,
  type CctpMessage,
} from '../../src/integrations/cctp/message'

// Delivers a transfer on Stellar and pays the fee, for an account that doesn't
// sign from a browser. The message is never taken from the caller: we ask
// Circle for it by burn hash and check it pays who the caller named.

export class RelayRefused extends Error {
  readonly status: 400 | 404 | 409 | 503

  constructor(message: string, status: 400 | 404 | 409 | 503 = 400) {
    super(message)
    this.name = 'RelayRefused'
    this.status = status
  }
}

const READ_SOURCE = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'

function passphrase(network: Network): string {
  return network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET
}

function sorobanUrl(network: Network): string {
  const env = network === 'mainnet' ? process.env.SOROBAN_RPC_MAINNET : process.env.SOROBAN_RPC_TESTNET
  return env || STELLAR_RPC_FALLBACK[network].soroban
}

function horizonUrl(network: Network): string {
  const env = network === 'mainnet' ? process.env.HORIZON_MAINNET : process.env.HORIZON_TESTNET
  return env || STELLAR_RPC_FALLBACK[network].horizon
}

// shut without a key, and mainnet needs its own switch on top
export function relayKeypair(network: Network): Keypair {
  const secret = process.env.CCTP_RELAY_SECRET ?? ''
  if (!secret || !StrKey.isValidEd25519SecretSeed(secret)) {
    throw new RelayRefused('delivery relay is not configured on this server', 503)
  }
  if (network === 'mainnet' && process.env.CCTP_RELAY_MAINNET !== '1') {
    throw new RelayRefused('delivery relay is testnet only on this server', 503)
  }
  return Keypair.fromSecret(secret)
}

// per UTC day, in memory. a leaked operator token still can't drain the account
const spent = { day: '', count: 0 }

export function takeDailySlot(now = new Date()): void {
  const day = now.toISOString().slice(0, 10)
  if (spent.day !== day) {
    spent.day = day
    spent.count = 0
  }
  const cap = Number(process.env.CCTP_RELAY_DAILY_CAP ?? '50')
  if (spent.count >= cap) throw new RelayRefused(`delivery relay hit its daily cap of ${cap}`, 503)
  spent.count++
}

export function resetDailySlotsForTest(): void {
  spent.day = ''
  spent.count = 0
}

async function readOnly(network: Network, contractId: string, fn: string, args: ReturnType<typeof nativeToScVal>[]) {
  const server = new rpc.Server(sorobanUrl(network))
  const tx = new TransactionBuilder(new Account(READ_SOURCE, '0'), {
    fee: INCLUSION_FEE_STROOPS,
    networkPassphrase: passphrase(network),
  })
    .addOperation(new Contract(contractId).call(fn, ...args))
    .setTimeout(60)
    .build()
  const sim = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(sim) || !sim.result) throw new Error(`${fn} read failed`)
  return scValToNative(sim.result.retval)
}

async function hasUsdcTrustline(network: Network, account: string): Promise<boolean> {
  const { usdcIssuer } = CONTRACTS[network].cctp
  try {
    const acct = await new Horizon.Server(horizonUrl(network)).loadAccount(account)
    const usdc = new Asset('USDC', usdcIssuer)
    return acct.balances.some(
      (b) =>
        'asset_code' in b &&
        b.asset_code === usdc.getCode() &&
        'asset_issuer' in b &&
        b.asset_issuer === usdc.getIssuer(),
    )
  } catch {
    return false
  }
}

export interface ClaimRequest {
  network: Network
  sourceDomain: number
  // the EVM burn hash, which is how Circle indexes the message
  burnTxHash: string
  // the Stellar account the caller says this transfer pays
  recipient: string
}

export type ClaimOutcome =
  | { status: 'delivered'; hash: string; amount: string }
  | { status: 'already-delivered' }
  | { status: 'not-attested-yet' }

// in canonical 6-decimal units, rendered for a person
function usdc(units: bigint): string {
  const whole = units / 1_000_000n
  const frac = (units % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole.toString()
}

export async function deliver(req: ClaimRequest): Promise<ClaimOutcome> {
  const { network } = req
  if (!StrKey.isValidEd25519PublicKey(req.recipient)) throw new RelayRefused('recipient is not a Stellar account')

  const att = await fetchAttestation(network, req.sourceDomain, req.burnTxHash)
  if (att.state !== 'complete') return { status: 'not-attested-yet' }

  let msg: CctpMessage
  try {
    msg = decodeCctpMessage(hexToBytes(att.message))
    assertMessageMatches(msg, {
      destinationDomain: STELLAR_CCTP_DOMAIN,
      forwarder: CONTRACTS[network].cctp.forwarder,
      recipient: req.recipient,
      sourceDomain: req.sourceDomain,
    })
    assertAttestation(hexToBytes(att.attestation))
  } catch (err) {
    throw new RelayRefused((err as Error).message)
  }

  const nonce = nativeToScVal(Buffer.from(hexToBytes(msg.nonce)), { type: 'bytes' })
  if ((await readOnly(network, CONTRACTS[network].cctp.messageTransmitter, 'is_nonce_used', [nonce])) === true) {
    return { status: 'already-delivered' }
  }
  if ((await readOnly(network, CONTRACTS[network].cctp.forwarder, 'paused', [])) === true) {
    throw new RelayRefused('Circle has paused deliveries on Stellar', 503)
  }
  if (!(await hasUsdcTrustline(network, req.recipient))) {
    throw new RelayRefused('the recipient has no USDC trustline, so the delivery would fail', 409)
  }

  const kp = relayKeypair(network)
  takeDailySlot()

  const server = new rpc.Server(sorobanUrl(network))
  const source = await server.getAccount(kp.publicKey())
  const tx = new TransactionBuilder(source, { fee: INCLUSION_FEE_STROOPS, networkPassphrase: passphrase(network) })
    .addOperation(
      new Contract(CONTRACTS[network].cctp.forwarder).call(
        'mint_and_forward',
        nativeToScVal(Buffer.from(hexToBytes(att.message)), { type: 'bytes' }),
        nativeToScVal(Buffer.from(hexToBytes(att.attestation)), { type: 'bytes' }),
      ),
    )
    .setTimeout(180)
    .build()

  const sim = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(sim)) throw new RelayRefused(`Stellar would reject the delivery: ${sim.error.split('\n')[0]}`)
  const prepared = rpc.assembleTransaction(tx, sim).build()
  prepared.sign(kp)

  const sent = await server.sendTransaction(prepared)
  if (sent.status === 'ERROR' || sent.status === 'TRY_AGAIN_LATER') {
    throw new Error(`Stellar did not accept the delivery (${sent.status})`)
  }
  // the envelope is valid for 180s; wait that long before calling it lost
  const deadline = Date.now() + 190_000
  while (Date.now() < deadline) {
    const res = await server.getTransaction(sent.hash)
    if (res.status === 'SUCCESS') return { status: 'delivered', hash: sent.hash, amount: usdc(amountToLand(msg)) }
    if (res.status === 'FAILED') throw new Error(`the delivery failed on chain (${sent.hash})`)
    await new Promise((r) => setTimeout(r, 3_000))
  }
  throw new Error(`no result for ${sent.hash} yet, check the explorer before trying again`)
}
