import { serve } from '@hono/node-server'

import { app } from './webhook'
import { pingDfns } from './dfns/client'

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


serve({ fetch: app.fetch, port: PORT })
console.log(`webhook listening on :${PORT}`)
