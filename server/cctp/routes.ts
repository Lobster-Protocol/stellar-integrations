import type { Hono, MiddlewareHandler } from 'hono'
import { z } from 'zod'

import { CONTRACTS, cctpChainsFor, STELLAR_CCTP_DOMAIN, type Network } from '../../src/config/contracts'
import { fetchAttestation, fetchFees, fetchForwardQuote, IrisError } from '../../src/integrations/cctp/iris'
import { amountToLand, decodeCctpMessage, evmRecipientOf, hexToBytes, recipientOf } from '../../src/integrations/cctp/message'
import { deliver, RelayRefused } from './relay'

const NetworkSchema = z.enum(['testnet', 'mainnet'])
const TxHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'txHash must be an EVM transaction hash')
// a Stellar hash is bare hex; the 0x form some tools print is taken too
const StellarTxHash = z
  .string()
  .regex(/^(0x)?[0-9a-fA-F]{64}$/, 'txHash must be a Stellar transaction hash')
  .transform((h) => h.replace(/^0x/i, '').toLowerCase())

// Number('') is 0, Ethereum's domain, so an empty or padded ?domain= would pick
// a chain the caller never named; only plain digits count
function digits(raw: unknown): number {
  return typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : NaN
}

function domainFor(network: Network, raw: unknown): number | null {
  const n = digits(raw)
  return cctpChainsFor(network).some((c) => c.domain === n) ? n : null
}

interface Guards {
  rateLimit: MiddlewareHandler
  tokenGuard: MiddlewareHandler
  operatorGuard: MiddlewareHandler
}

// The browser runs the bridge without us. These follow a transfer over plain HTTP,
// either way, and pay the delivery for an account that doesn't sign from a browser.
export function registerCctpRoutes(app: Hono, guards: Guards): void {
  app.get('/cctp/chains', (c) => {
    const network = NetworkSchema.safeParse(c.req.query('network'))
    if (!network.success) return c.json({ error: 'network must be testnet or mainnet' }, 400)
    const { forwarder, usdcIssuer, usdcSac, tokenMessengerMinter, messageTransmitter } = CONTRACTS[network.data].cctp
    return c.json({
      destinationDomain: STELLAR_CCTP_DOMAIN,
      // into Stellar a burn names the forwarder as mintRecipient and destinationCaller;
      // out of Stellar it goes through the TokenMessengerMinter. An integrator reads
      // both here rather than copying them from the docs
      stellar: { domain: STELLAR_CCTP_DOMAIN, forwarder, usdcIssuer, usdcSac, tokenMessengerMinter, messageTransmitter },
      directions: ['to-stellar', 'from-stellar'],
      items: cctpChainsFor(network.data).map((ch) => ({
        key: ch.key,
        name: ch.name,
        domain: ch.domain,
        chainId: ch.chainId,
        usdc: ch.usdc,
        tokenMessenger: ch.tokenMessenger,
        messageTransmitter: ch.messageTransmitter,
      })),
    })
  })

  // ?domain= the EVM chain burning into Stellar; or ?domain=27&destination= the EVM
  // chain a Stellar burn goes to, which adds what Circle charges to mint it there
  app.get('/cctp/fees', async (c) => {
    const network = NetworkSchema.safeParse(c.req.query('network'))
    if (!network.success) return c.json({ error: 'network must be testnet or mainnet' }, 400)
    try {
      if (digits(c.req.query('domain')) === STELLAR_CCTP_DOMAIN) {
        const destination = domainFor(network.data, c.req.query('destination'))
        if (destination === null) return c.json({ error: 'destination is not a chain we carry USDC to' }, 400)
        const quote = await fetchForwardQuote(network.data, destination)
        return c.json({ sourceDomain: STELLAR_CCTP_DOMAIN, destinationDomain: destination, forwardFee: quote.fee.toString(), bps: quote.bps })
      }
      const domain = domainFor(network.data, c.req.query('domain'))
      if (domain === null) return c.json({ error: 'domain is not a source chain we burn from' }, 400)
      return c.json(await fetchFees(network.data, domain))
    } catch (err) {
      return c.json({ error: (err as Error).message }, 502)
    }
  })

  // decoded, so nobody has to parse CCTP bytes to see who it pays
  app.get('/cctp/message', async (c) => {
    const network = NetworkSchema.safeParse(c.req.query('network'))
    if (!network.success) return c.json({ error: 'network must be testnet or mainnet' }, 400)
    const out = digits(c.req.query('domain')) === STELLAR_CCTP_DOMAIN
    const domain = out ? STELLAR_CCTP_DOMAIN : domainFor(network.data, c.req.query('domain'))
    if (domain === null) return c.json({ error: 'domain is not a source chain we burn from' }, 400)
    const txHash = (out ? StellarTxHash : TxHash).safeParse(c.req.query('txHash'))
    if (!txHash.success) return c.json({ error: txHash.error.issues[0]?.message }, 400)
    try {
      // out of Stellar the message itself names the EVM chain
      const att = await fetchAttestation(network.data, domain, txHash.data, 10_000, out ? null : STELLAR_CCTP_DOMAIN)
      if (att.state === 'pending') return c.json({ state: 'pending', delayReason: att.delayReason })
      const msg = decodeCctpMessage(hexToBytes(att.message))
      return c.json({
        state: 'attested',
        sourceDomain: msg.sourceDomain,
        destinationDomain: msg.destinationDomain,
        nonce: msg.nonce,
        recipient: out ? evmRecipientOf(msg) : recipientOf(msg).recipient,
        amount: msg.body.amount.toString(),
        amountToLand: amountToLand(msg).toString(),
        feeExecuted: msg.body.feeExecuted.toString(),
        expirationLedger: msg.body.expirationBlock.toString(),
        ...(out
          ? {
              // Circle's own mint on the EVM chain, when the burn asked for it
              forwardState: att.forwardState,
              forwardTxHash: att.forwardTxHash,
              message: att.message,
              attestation: att.attestation,
            }
          : {}),
      })
    } catch (err) {
      const status = err instanceof IrisError ? 502 : 400
      return c.json({ error: (err as Error).message }, status)
    }
  })

  const ClaimSchema = z.object({
    network: NetworkSchema,
    sourceDomain: z.number().int().nonnegative(),
    txHash: TxHash,
    recipient: z.string().regex(/^G[A-Z2-7]{55}$/, 'recipient must be a Stellar account'),
  })

  // spends the relay account's XLM, so it also takes the operator token. Into Stellar
  // only: out of it Circle mints, or the recipient's own wallet does
  app.post('/cctp/deliver', guards.rateLimit, guards.tokenGuard, guards.operatorGuard, async (c) => {
    const parsed = ClaimSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'bad request' }, 400)
    const { network, sourceDomain, txHash, recipient } = parsed.data
    if (domainFor(network, sourceDomain) === null) {
      return c.json({ error: 'sourceDomain is not a source chain we burn from' }, 400)
    }
    try {
      const out = await deliver({ network, sourceDomain, burnTxHash: txHash, recipient })
      if (out.status === 'not-attested-yet') return c.json(out, 404)
      return c.json(out)
    } catch (err) {
      if (err instanceof RelayRefused) return c.json({ error: err.message }, err.status)
      return c.json({ error: (err as Error).message }, 502)
    }
  })
}
