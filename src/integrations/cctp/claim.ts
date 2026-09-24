import { Contract, TransactionBuilder, nativeToScVal, rpc } from '@stellar/stellar-sdk'

import { getSorobanServer, networkPassphrase, loadFunded } from '../lobster/client'
import { submitSignedXdr, waitForTx } from '../lobster/factory'
import { simulateRead } from '../stellar/read'
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

// read-only calls need a source account but never touch it
const READ_SOURCE = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'

type ClaimCheck =
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
  const { cctp } = CONTRACTS[network]
  assertMessageMatches(msg, {
    destinationDomain: STELLAR_CCTP_DOMAIN,
    forwarder: cctp.forwarder,
    recipient: expectedRecipient,
    sourceDomain,
  })
  assertAttestation(hexToBytes(attestationHex))

  // a spent nonce means the USDC already landed, whoever submitted it
  const nonce = nativeToScVal(Buffer.from(hexToBytes(msg.nonce)), { type: 'bytes' })
  if (await simulateRead<boolean>(network, READ_SOURCE, cctp.messageTransmitter, 'is_nonce_used', [nonce])) {
    return { ok: false, reason: 'already-claimed', msg }
  }
  if (await simulateRead<boolean>(network, READ_SOURCE, cctp.forwarder, 'paused')) {
    return { ok: false, reason: 'paused', msg }
  }

  // the expiration is a Stellar ledger number, about a day after the burn
  const exp = msg.body.expirationBlock
  if (exp !== 0n) {
    const latest = await getSorobanServer(network).getLatestLedger()
    if (BigInt(latest.sequence) >= exp) return { ok: false, reason: 'expired', msg }
  }

  // M recipients aren't pre-checked: the trustline that counts is on their base G account
  const recipient = recipientOf(msg).recipient
  if (recipient.startsWith('G') && !(await hasTrustline(recipient, 'USDC', cctp.usdcIssuer, network))) {
    return { ok: false, reason: 'no-trustline', msg }
  }
  return { ok: true, msg }
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

// mint_and_forward carries no auth entry, so whoever submits it only pays the
// fee. The connected wallet can deliver a transfer meant for someone else.
export async function claimOnStellar(opts: {
  network: Network
  payer: string
  signer: Signer
  messageHex: string
  attestationHex: string
}) {
  const { network, payer } = opts
  const server = getSorobanServer(network)
  const source = await loadFunded(server, payer, network)
  const tx = new TransactionBuilder(source, {
    fee: INCLUSION_FEE_STROOPS,
    networkPassphrase: networkPassphrase(network),
  })
    .addOperation(
      new Contract(CONTRACTS[network].cctp.forwarder).call(
        'mint_and_forward',
        nativeToScVal(Buffer.from(hexToBytes(opts.messageHex)), { type: 'bytes' }),
        nativeToScVal(Buffer.from(hexToBytes(opts.attestationHex)), { type: 'bytes' }),
      ),
    )
    .setTimeout(180)
    .build()

  const sim = await server.simulateTransaction(tx)
  if (rpc.Api.isSimulationError(sim)) throw new Error(explainClaimFailure(sim.error))
  const xdr = rpc.assembleTransaction(tx, sim).build().toXDR()

  const signed = await opts.signer.signTransaction(xdr, { networkPassphrase: networkPassphrase(network), address: payer })
  if (!signed.signedTxXdr) throw new Error('The wallet did not return a signed transaction')
  const hash = await submitSignedXdr(network, signed.signedTxXdr)
  const res = await waitForTx(network, hash)
  if (res.status !== 'SUCCESS') throw new Error(`The delivery transaction failed on Stellar (${hash})`)
  return { hash }
}
