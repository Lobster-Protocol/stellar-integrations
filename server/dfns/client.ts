import { DfnsApiClient } from '@dfns/sdk'
import { AsymmetricKeySigner } from '@dfns/sdk-keysigner'
import { readFileSync } from 'node:fs'

import { requireEnv } from '../env'

let cached: DfnsApiClient | null = null

// the key content can come straight from an env var (cloud deploys where there
// is no file to mount), falling back to a path for local dev. a value pasted on
// a single line keeps its \n escaped, so unescape it.
function loadPrivateKey(): string {
  const inline = process.env.DFNS_PRIVATE_KEY
  if (inline) return inline.replace(/\\n/g, '\n')
  return readFileSync(requireEnv('DFNS_PRIVATE_KEY_PATH'), 'utf-8')
}

export function getDfnsClient(): DfnsApiClient {
  if (cached) return cached
  const privateKey = loadPrivateKey()
  const signer = new AsymmetricKeySigner({
    credId: requireEnv('DFNS_CRED_ID'),
    privateKey,
  })
  cached = new DfnsApiClient({
    baseUrl: requireEnv('DFNS_API_URL'),
    authToken: requireEnv('DFNS_AUTH_TOKEN'),
    signer,
  })
  return cached
}

// listing one wallet is the lightest authenticated call. fail-fast on
// boot lets a bad PEM or stale token error out before traffic arrives.
export async function pingDfns(): Promise<void> {
  await getDfnsClient().wallets.listWallets({ query: { limit: 1 } })
}
