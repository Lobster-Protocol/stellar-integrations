import { DfnsApiClient } from '@dfns/sdk'
import { AsymmetricKeySigner } from '@dfns/sdk-keysigner'

import { requireEnv } from '../env'

// votes as a dedicated DFNS User, not the service account: a service account can
// vote only with serviceAccountsCanApprove, which DFNS gates behind a support
// ticket. the User's Key credential sits in the relay env, so no passkey prompt.
export function approverConfigured(): boolean {
  return Boolean(
    process.env.DFNS_APPROVER_AUTH_TOKEN &&
      process.env.DFNS_APPROVER_CRED_ID &&
      process.env.DFNS_APPROVER_PRIVATE_KEY,
  )
}

// not cached, so a key rotated in the env is picked up on the next hold. holds are
// rare, so there is no hot path to save.
export function getApproverClient(): DfnsApiClient {
  const signer = new AsymmetricKeySigner({
    credId: requireEnv('DFNS_APPROVER_CRED_ID'),
    // a PEM pasted on one line keeps its newlines escaped
    privateKey: requireEnv('DFNS_APPROVER_PRIVATE_KEY').replace(/\\n/g, '\n'),
  })
  return new DfnsApiClient({
    baseUrl: requireEnv('DFNS_API_URL'),
    authToken: requireEnv('DFNS_APPROVER_AUTH_TOKEN'),
    signer,
    ...(process.env.DFNS_ORG_ID ? { orgId: process.env.DFNS_ORG_ID } : {}),
  })
}
