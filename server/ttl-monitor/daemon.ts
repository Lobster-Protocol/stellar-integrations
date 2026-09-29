import { startLoop, readConfigs } from './index'

// out-of-process runner; server/index.ts runs the same loop when TTL_MONITOR_EMBEDDED=1.
for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    console.warn(`[ttl-monitor] ${sig}, exiting`)
    process.exit(0)
  })
}

for (const config of readConfigs()) {
  startLoop(config).catch((err) => {
    console.error(`[ttl-monitor:${config.network}] loop crashed`, err)
    process.exit(1)
  })
}
