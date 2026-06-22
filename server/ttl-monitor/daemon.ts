import { startLoop } from './index'

// standalone worker (npm run ttl-monitor). server/index.ts runs the same loop
// in-process when TTL_MONITOR_EMBEDDED=1; this is the out-of-process version a
// scheduler or a separate dyno owns.
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.warn(`[ttl-monitor] ${sig}, exiting`)
    process.exit(0)
  })
}

startLoop().catch((err) => {
  console.error('[ttl-monitor] loop crashed', err)
  process.exit(1)
})
