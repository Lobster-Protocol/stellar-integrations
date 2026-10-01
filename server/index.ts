import { serve } from '@hono/node-server'
import { Hono } from 'hono'

import { app } from './webhook'
import { pingDfns } from './dfns/client'
import { metricsTiming, mountMetrics } from './metrics/http'
import { startDfnsMetricsLoop } from './metrics/dfns-signing'
import { registry } from './metrics/registry'
import { otlpEnabled, pushExposition } from './metrics/otlp'
import { startLoop as startTtlLoop, readConfigs as ttlConfigs } from './ttl-monitor/index'
import { signerFromEnv as ttlSigner } from './ttl-monitor/signer'
import { scan as scanHealth, formatMetrics as formatHealth } from './probe/index'

const PORT = Number(process.env.PORT || 8787)

// fail fast on bad dfns credentials. dfns-keysigner does not throw on a bad
// PEM at construction, only on the first authed call, so make one at boot.
if (process.env.DFNS_PRIVATE_KEY_PATH || process.env.DFNS_PRIVATE_KEY) {
  await pingDfns().catch((err) => {
    console.error('dfns ping failed at boot:', err)
    process.exit(1)
  })
} else {
  console.log('dfns ping skipped (no dfns key configured, dev mode)')
}


// timing has to go on the root before the routes are mounted, or hono won't wrap them.
const root = new Hono()
root.use('*', metricsTiming())
mountMetrics(root)
root.route('/', app)

// only poll dfns when something reads the result, a scrape or the push below.
if ((process.env.METRICS_TOKEN || otlpEnabled()) && (process.env.DFNS_PRIVATE_KEY_PATH || process.env.DFNS_PRIVATE_KEY)) {
  startDfnsMetricsLoop()
}

// the relay never sleeps, so it runs the ttl and health scans itself.
if (process.env.TTL_MONITOR_EMBEDDED === '1') {
  for (const config of ttlConfigs()) {
    startTtlLoop(config, ttlSigner(config.network)).catch((err) => console.error(`[ttl-monitor:${config.network}] loop crashed`, err))
  }
}
if (process.env.PROBE_EMBEDDED === '1') {
  const pass = async () => {
    try {
      const result = await scanHealth()
      for (const p of result.probes) if (!p.up) console.warn(`[probe] DOWN ${p.name} (${p.area})`)
      if (otlpEnabled()) await pushExposition(formatHealth(result), 'lobster-probe')
    } catch (err) {
      console.error('[probe] pass failed', err)
    }
  }
  void pass()
  setInterval(pass, Number(process.env.PROBE_INTERVAL_MS) || 60_000)
}
if (otlpEnabled()) {
  setInterval(() => {
    registry
      .metrics()
      .then((text) => pushExposition(text, 'lobster-relay'))
      .catch((err) => console.error('[metrics] push failed', err))
  }, 60_000)
}

serve({ fetch: root.fetch, port: PORT })
console.log(`webhook listening on :${PORT}`)
