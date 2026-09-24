import {
  Contract,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  rpc,
  Account,
} from '@stellar/stellar-sdk'

import { getSorobanServer, networkPassphrase, loadFunded } from '../lobster/client'
import { submitSignedXdr, waitForTx } from '../lobster/factory'
import type { Signer } from '../signer/types'
import { hasTrustline } from '../stellar/trustline'
import {
  CONTRACTS,
  INCLUSION_FEE_STROOPS,
  STELLAR_CCTP_DOMAIN,
  type Network,
} from '../../config/contracts'
import {
  assertAttestation,
  assertMessageMatches,
  decodeCctpMessage,
  hexToBytes,
  recipientOf,
  type CctpMessage,
} from './message'

// mint_and_forward carries no auth entry, so whoever submits it only pays the
// fee. The connected wallet can deliver a transfer meant for someone else.

export class ClaimError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ClaimError'
  }
}

// read-only calls need a source account but never touch it
const READ_SOURCE = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'

async function readOnly(network: Network, contractId: string, fn: string, args: ReturnType<typeof nativeToScVal>[]) {
  const server = getSorobanServer(network)
  const tx = new TransactionBuilder(new Account(READ_SOURCE, '0'), {
    fee: INCLUSION_FEE_STROOPS,
    networkPassphrase: networkPassphrase(network),
  })
    .addOperation(new Contract(contractId).call(fn, ...args))
    .setTimeout(60)
    .build()
  const sim = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(sim)) throw new ClaimError(sim.error)
  if (!sim.result) throw new ClaimError(`${fn} returned nothing`)
  return scValToNative(sim.result.retval)
}

// a spent nonce means the USDC already landed, whoever submitted it
export async function isAlreadyClaimed(network: Network, msg: CctpMessage): Promise<boolean> {
  const nonce = nativeToScVal(Buffer.from(hexToBytes(msg.nonce)), { type: 'bytes' })
  const used = await readOnly(network, CONTRACTS[network].cctp.messageTransmitter, 'is_nonce_used', [nonce])
  return used === true
}

export async function forwarderPaused(network: Network): Promise<boolean> {
  return (await readOnly(network, CONTRACTS[network].cctp.forwarder, 'paused', [])) === true
}

export type ClaimCheck =
  | { ok: true; msg: CctpMessage }
  | { ok: false; reason: 'already-claimed' | 'expired' | 'no-trustline' | 'paused'; msg: CctpMessage }

// what would make the delivery fail, checked before paying for it
export async function checkClaim(
  network: Network,
  messageHex: string,
  attestationHex: string,
  expectedRecipient: string,
  sourceDomain?: number,
): Promise<ClaimCheck> {
  const msg = decodeCctpMessage(hexToBytes(messageHex))
  assertMessageMatches(msg, {
    destinationDomain: STELLAR_CCTP_DOMAIN,
    forwarder: CONTRACTS[network].cctp.forwarder,
    recipient: expectedRecipient,
    sourceDomain,
  })
  assertAttestation(hexToBytes(attestationHex))

  if (await isAlreadyClaimed(network, msg)) return { ok: false, reason: 'already-claimed', msg }
  if (await forwarderPaused(network)) return { ok: false, reason: 'paused', msg }

  // the expiration is a Stellar ledger number, about a day after the burn
  const exp = msg.body.expirationBlock
  if (exp !== 0n) {
    const latest = await getSorobanServer(network).getLatestLedger()
    if (BigInt(latest.sequence) >= exp) return { ok: false, reason: 'expired', msg }
  }

  const { usdcIssuer } = CONTRACTS[network].cctp
  const recipient = recipientOf(msg).recipient
  // a muxed address pays its base account, whose trustline is the one that counts
  if (recipient.startsWith('G') && !(await hasTrustline(recipient, 'USDC', usdcIssuer, network))) {
    return { ok: false, reason: 'no-trustline', msg }
  }
  return { ok: true, msg }
}

export async function buildClaimTx(
  network: Network,
  payer: string,
  messageHex: string,
  attestationHex: string,
): Promise<string> {
  const server = getSorobanServer(network)
  const source = await loadFunded(server, payer, network)
  const forwarder = new Contract(CONTRACTS[network].cctp.forwarder)
  const tx = new TransactionBuilder(source, {
    fee: INCLUSION_FEE_STROOPS,
    networkPassphrase: networkPassphrase(network),
  })
    .addOperation(
      forwarder.call(
        'mint_and_forward',
        nativeToScVal(Buffer.from(hexToBytes(messageHex)), { type: 'bytes' }),
        nativeToScVal(Buffer.from(hexToBytes(attestationHex)), { type: 'bytes' }),
      ),
    )
    .setTimeout(180)
    .build()

  const sim = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(sim)) throw new ClaimError(explainClaimFailure(sim.error))
  return rpc.assembleTransaction(tx, sim).build().toXDR()
}

// Circle's contracts fail with bare numbers. 6908 is the message transmitter's
// spent nonce, 6000-6013 the attestation check. Anything else is shown raw.
export function explainClaimFailure(raw: string): string {
  const code = /Error\(Contract, #(\d+)\)/.exec(raw)?.[1]
  if (code === '6908') return 'This transfer was already delivered. The USDC is on the account.'
  if (code && Number(code) >= 6000 && Number(code) <= 6013) {
    return "Circle's signature on this transfer did not verify. Fetch the attestation again and retry."
  }
  return `Stellar would reject the delivery: ${raw.split('\n')[0]}`
}

export interface ClaimResult {
  hash: string
  ledger?: number
}

export async function claimOnStellar(opts: {
  network: Network
  payer: string
  signer: Signer
  messageHex: string
  attestationHex: string
}): Promise<ClaimResult> {
  const xdr = await buildClaimTx(opts.network, opts.payer, opts.messageHex, opts.attestationHex)
  const signed = await opts.signer.signTransaction(xdr, {
    networkPassphrase: networkPassphrase(opts.network),
    address: opts.payer,
  })
  if (!signed.signedTxXdr) {
    throw new ClaimError('The wallet did not return a signed transaction')
  }
  const hash = await submitSignedXdr(opts.network, signed.signedTxXdr)
  const res = await waitForTx(opts.network, hash)
  if (res.status !== 'SUCCESS') {
    throw new ClaimError(`The delivery transaction failed on Stellar (${hash})`)
  }
  return { hash, ledger: res.ledger }
}
