import type { Hono } from 'hono'

import * as bridge from './bridge'
import { QuoteSchema, SendSchema, ApproveSchema } from './types'

// Read-only + build-only Allbridge endpoints. Everything hits the mainnet
// Allbridge core api and builds unsigned txs; nothing signs or holds a secret,
// so no auth. Allbridge is mainnet-only, so these always target mainnet - the
// backend is ready for a future deployment, and the read/quote/status calls work
// live today without a wallet or funds.
export function registerAllbridgeRoutes(app: Hono): void {
  app.get('/allbridge/tokens', async (c) => {
    const chain = c.req.query('chain')
    if (chain !== 'ETH' && chain !== 'ARB') return c.json({ error: 'chain must be ETH or ARB' }, 400)
    try {
      const tokens = await bridge.listTokens(chain)
      return c.json({
        items: tokens.map((t) => ({
          symbol: t.symbol,
          decimals: t.decimals,
          tokenAddress: t.tokenAddress,
          bridgeAddress: t.bridgeAddress,
          chainSymbol: t.chainSymbol,
        })),
      })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 502)
    }
  })

  app.post('/allbridge/quote', async (c) => {
    const parsed = QuoteSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'bad request' }, 400)
    try {
      return c.json(await bridge.quote(parsed.data.sourceChain, parsed.data.amount))
    } catch (err) {
      return c.json({ error: (err as Error).message }, 502)
    }
  })

  app.get('/allbridge/status', async (c) => {
    const chain = c.req.query('chain')
    const txId = c.req.query('txId')
    if (chain !== 'ETH' && chain !== 'ARB') return c.json({ error: 'chain must be ETH or ARB' }, 400)
    if (!txId) return c.json({ error: 'txId required' }, 400)
    try {
      return c.json(await bridge.transferStatus(chain, txId))
    } catch (err) {
      return c.json({ error: (err as Error).message }, 502)
    }
  })

  app.post('/allbridge/raw/approve', async (c) => {
    const parsed = ApproveSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'bad request' }, 400)
    try {
      return c.json({ rawTx: await bridge.buildApprove(parsed.data.sourceChain, parsed.data.owner, parsed.data.amount) })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 502)
    }
  })

  app.post('/allbridge/raw/send', async (c) => {
    const parsed = SendSchema.safeParse(await c.req.json().catch(() => null))
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'bad request' }, 400)
    try {
      return c.json({
        rawTx: await bridge.buildSend(parsed.data.sourceChain, parsed.data.amount, parsed.data.fromAddress, parsed.data.toAddress),
      })
    } catch (err) {
      return c.json({ error: (err as Error).message }, 502)
    }
  })
}
