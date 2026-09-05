import { readFileSync } from 'node:fs'

import { requireEnv } from '../env'
import { readSignGuardConfig } from '../dfns/sign-guard'
import { DfnsStellarNetworkSchema, type DfnsStellarNetwork } from '../dfns/types'
import type { Tenant } from './types'

// the reserved id our own env-sourced org loads under. it is the ONLY tenant
// allowed to read its credentials from process.env; client tenants come from the
// store. holding it as a constant lets the separation guard compare against it.
export const DEMO_TENANT_ID = '__lobster_demo__'

// dfns spells the networks StellarTestnet / Stellar, the same mapping the front
// custody context uses. an unset or unknown value falls to testnet, matching
// serverPassphrase() which only treats the literal 'Stellar' as mainnet.
function demoNetwork(): DfnsStellarNetwork {
  const parsed = DfnsStellarNetworkSchema.safeParse(process.env.DFNS_STELLAR_NETWORK)
  return parsed.success ? parsed.data : 'StellarTestnet'
}

// the key content can come straight from an env var (cloud deploys where there
// is no file to mount), falling back to a path for local dev. a value pasted on
// a single line keeps its \n escaped, so unescape it.
function loadPrivateKey(): string {
  const inline = process.env.DFNS_PRIVATE_KEY
  if (inline) return inline.replace(/\\n/g, '\n')
  return readFileSync(requireEnv('DFNS_PRIVATE_KEY_PATH'), 'utf-8')
}

// true when any dfns credential is present. tells an unconfigured dev box apart
// from a half-set deploy, which the requireEnv calls below still reject on use.
export function demoDfnsConfigured(): boolean {
  return Boolean(
    process.env.DFNS_PRIVATE_KEY ||
      process.env.DFNS_PRIVATE_KEY_PATH ||
      process.env.DFNS_AUTH_TOKEN,
  )
}

// builds the demo tenant from process.env, throwing the same requireEnv errors
// the old getDfnsClient did when a field is missing. treasury and guard stay null
// when their env is unset, which the routes already handle with a 503.
export function requireDemoTenant(): Tenant {
  const walletId = process.env.DFNS_STELLAR_WALLET_ID
  return {
    id: DEMO_TENANT_ID,
    kind: 'demo',
    label: 'Lobster demo custody',
    dfns: {
      baseUrl: requireEnv('DFNS_API_URL'),
      authToken: requireEnv('DFNS_AUTH_TOKEN'),
      credId: requireEnv('DFNS_CRED_ID'),
      privateKey: loadPrivateKey(),
      orgId: process.env.DFNS_ORG_ID || undefined,
    },
    treasury: walletId ? { walletId, network: demoNetwork() } : null,
    guard: readSignGuardConfig(),
  }
}
