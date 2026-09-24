import { serve } from '@hono/node-server'
import { Hono } from 'hono'

import { app } from './webhook'
import { pingDfns } from './dfns/client'
import { metricsTiming, mountMetrics } from './metrics/http'
import { startDfnsMetricsLoop } from './metrics/dfns-signing'

const PORT = Number(process.env.PORT || 8787)

// fail-fast at boot if the dfns credentials are wrong. dfns-keysigner
// does not throw on bad PEMs at construction. the first authed call is
// when the decoder error shows up, so trigger one before traffic arrives.
// dev path (no dfns vars set) skips the ping so local e2e can boot
// without a PEM on disk.
if (process.env.DFNS_PRIVATE_KEY_PATH || process.env.DFNS_PRIVATE_KEY) {
  await pingDfns().catch((err) => {
    console.error('dfns ping failed at boot:', err)
    process.exit(1)
  })
} else {
  console.log('dfns ping skipped (no dfns key configured, dev mode)')
}


// a root app wraps the route module so request timing and a token-gated /metrics
// sit in front without editing webhook.ts. the timing middleware is registered
// before the mount so it wraps every mounted route, and it only ever observes, so a
// metrics failure can never change a response.
const root = new Hono()
root.use('*', metricsTiming())
mountMetrics(root)
root.route('/', app)

// the dfns approval gauge polls the custody org read-only. off unless a scrape token
// is set (so /metrics is reachable at all) and dfns creds are present; without both
// there is nothing to read or no one to read it.
if (process.env.METRICS_TOKEN && (process.env.DFNS_PRIVATE_KEY_PATH || process.env.DFNS_PRIVATE_KEY)) {
  startDfnsMetricsLoop()
}

serve({ fetch: root.fetch, port: PORT })
console.log(`webhook listening on :${PORT}`)
