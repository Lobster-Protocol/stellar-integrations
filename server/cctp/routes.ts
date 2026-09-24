import type { Hono, MiddlewareHandler } from 'hono'
import { z } from 'zod'

import { cctpChainsFor, STELLAR_CCTP_DOMAIN, type Network } from '../../src/config/contracts'
import { fetchAttestation, fetchFees, IrisError } from '../../src/integrations/cctp/iris'
import { amountToLand, decodeCctpMessage, hexToBytes, recipientOf } from '../../src/integrations/cctp/message'
import { deliver, RelayRefused } from './relay'

// The browser runs the bridge without us. These are for following a transfer
// over plain HTTP, and for paying the delivery of an account that doesn't sign
// from a browser.

const NetworkSchema = z.enum(['testnet', 'mainnet'])
const TxHash = z.string().regex(/^0x[0-9a-fA-F]{64}$/, 'txHash must be an EVM transaction hash')

function domainFor(network: Network, raw: unknown): number | null {
  const n = Number(raw)
  return cctpChainsFor(network).some((c) => c.domain === n) ? n : null
}

interface Guards {
  rateLimit: MiddlewareHandler
  tokenGuard: MiddlewareHandler
  operatorGuard: MiddlewareHandler
}

export function registerCctpRoutes(app: Hono, guards: Guards): void {
  app.get('/cctp/chains', (c) => {
    const network = NetworkSchema.safeParse(c.req.query('network'))
    if (!network.success) return c.json({ error: 'network must be testnet or mainnet' }, 400)
    return c.json({
      destinationDomain: STELLAR_CCTP_DOMAIN,
      items: cctpChainsFor(network.data).map((ch) => ({
        key: ch.key,
        name: ch.name,
        domain: ch.domain,
        chainId: ch.chainId,
        usdc: ch.usdc,
        tokenMessenger: ch.tokenMessenger,
      })),
    })
  })

  app.get('/cctp/fees', async (c) => {
    const network = NetworkSchema.safeParse(c.req.query('network'))
    if (!network.success) return c.json({ error: 'network must be testnet or mainnet' }, 400)
    const domain = domainFor(network.data, c.req.query('domain'))
    if (domain === null) return c.json({ error: 'domain is not a source chain we burn from' }, 400)
    try {
      return c.json(await fetchFees(network.data, domain))
    } catch (err) {
      return c.json({ error: (err as Error).message }, 502)
    }
  })

  // decoded, so nobody has to parse CCTP bytes to see who it pays
  app.get('/cctp/message', async (c) => {
    const network = NetworkSchema.safeParse(c.req.query('network'))
    if (!network.success) return c.json({ error: 'network must be testnet or mainnet' }, 400)
    const domain = domainFor(network.data, c.req.query('domain'))
    if (domain === null) return c.json({ error: 'domain is not a source chain we burn from' }, 400)
    const txHash = TxHash.safeParse(c.req.query('txHash'))
    if (!txHash.success) return c.json({ error: txHash.error.issues[0]?.message }, 400)
    try {
      const att = await fetchAttestation(network.data, domain, txHash.data)
      if (att.state === 'pending') return c.json({ state: 'pending', delayReason: att.delayReason })
      const msg = decodeCctpMessage(hexToBytes(att.message))
      return c.json({
        state: 'attested',
        sourceDomain: msg.sourceDomain,
        destinationDomain: msg.destinationDomain,
        nonce: msg.nonce,
        recipient: recipientOf(msg).recipient,
        amount: msg.body.amount.toString(),
        amountToLand: amountToLand(msg).toString(),
        feeExecuted: msg.body.feeExecuted.toString(),
        expirationLedger: msg.body.expirationBlock.toString(),
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

  // spends our XLM, so operator token like every route that costs us something
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
