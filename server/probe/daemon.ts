import { scan, pushMetrics } from './index'

// scan service health + balances on a loop. pushgateway is optional; without it
// a run just logs what's down.
const INTERVAL_MS = Number(process.env.PROBE_INTERVAL_MS) || 60_000
const PUSHGATEWAY_URL = process.env.PUSHGATEWAY_URL

async function runOnce(): Promise<void> {
  const result = await scan()
  for (const p of result.probes) {
    if (!p.up) console.warn(`[probe] DOWN ${p.name} (${p.deliverable})`)
  }
  for (const a of result.accounts) {
    if (!a.exists) console.warn(`[probe] account ${a.role}/${a.network} not found`)
  }
  if (PUSHGATEWAY_URL) await pushMetrics(PUSHGATEWAY_URL, result)
}

async function startLoop(): Promise<void> {
  console.warn(`[probe] watching service health + balances every ${INTERVAL_MS}ms`)
  for (;;) {
    try {
      await runOnce()
    } catch (err) {
      console.error('[probe] pass failed', err)
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS))
  }
}

const stop = (sig: string) => {
  console.warn(`[probe] ${sig}, exiting`)
  process.exit(0)
}
process.on('SIGINT', () => stop('SIGINT'))
process.on('SIGTERM', () => stop('SIGTERM'))

startLoop().catch((err) => {
  console.error('[probe] fatal', err)
  process.exit(1)
})
