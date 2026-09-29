import { readFileSync } from 'node:fs'

import { requireEnv } from '../env'
import { readSignGuardConfig } from '../dfns/sign-guard'
import { DfnsStellarNetworkSchema, type DfnsStellarNetwork } from '../dfns/types'
import type { Tenant } from './types'

// the reserved id our own env-sourced org loads under. it is the ONLY tenant
// allowed to read its credentials from process.env.
export const DEMO_TENANT_ID = '__lobster_demo__'

// treasury and guard stay null when their env is unset; the routes answer with a 503.
export function requireDemoTenant(): Tenant {
  const walletId = process.env.DFNS_STELLAR_WALLET_ID
  // dfns spells the networks StellarTestnet / Stellar. an unset or unknown value
  // falls to testnet, matching serverPassphrase() which only treats 'Stellar' as mainnet.
  const parsed = DfnsStellarNetworkSchema.safeParse(process.env.DFNS_STELLAR_NETWORK)
  const network: DfnsStellarNetwork = parsed.success ? parsed.data : 'StellarTestnet'
  // cloud deploys have no file to mount, so the key can sit inline in the env.
  // pasted on a single line it keeps its \n escaped.
  const inlineKey = process.env.DFNS_PRIVATE_KEY
  return {
    id: DEMO_TENANT_ID,
    kind: 'demo',
    label: 'Lobster demo custody',
    dfns: {
      baseUrl: requireEnv('DFNS_API_URL'),
      authToken: requireEnv('DFNS_AUTH_TOKEN'),
      credId: requireEnv('DFNS_CRED_ID'),
      privateKey: inlineKey
        ? inlineKey.replace(/\\n/g, '\n')
        : readFileSync(requireEnv('DFNS_PRIVATE_KEY_PATH'), 'utf-8'),
      orgId: process.env.DFNS_ORG_ID || undefined,
    },
    treasury: walletId ? { walletId, network } : null,
    guard: readSignGuardConfig(),
  }
}
