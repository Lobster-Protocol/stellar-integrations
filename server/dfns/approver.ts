import { DfnsApiClient } from '@dfns/sdk'
import { AsymmetricKeySigner } from '@dfns/sdk-keysigner'

import { requireEnv } from '../env'

// The auto-approver votes as a dedicated DFNS User, never as the initiating
// service account. A service account can vote only when serviceAccountsCanApprove
// is enabled on the org, and that flag is gated behind a DFNS support ticket. A
// User approver needs no such flag - only the Policies:Evaluations:Vote permission
// and membership in the policy's approval group. The User holds a raw Key
// credential whose private key lives in the relay env, so the relay signs the
// approval itself, with no passkey prompt and no one clicking approve.

export function approverConfigured(): boolean {
  return Boolean(
    process.env.DFNS_APPROVER_AUTH_TOKEN &&
      process.env.DFNS_APPROVER_CRED_ID &&
      process.env.DFNS_APPROVER_PRIVATE_KEY,
  )
}

// Built on demand: a policy hold is rare (only a held signature reaches here), so
// there is no hot path to cache for, and building fresh means a key rotated in the
// env is picked up on the next hold rather than served stale from a cached signer.
export function getApproverClient(): DfnsApiClient {
  const signer = new AsymmetricKeySigner({
    credId: requireEnv('DFNS_APPROVER_CRED_ID'),
    // a PEM pasted on one line keeps its newlines escaped; unescape it, the same
    // way the service-account key loader does.
    privateKey: requireEnv('DFNS_APPROVER_PRIVATE_KEY').replace(/\\n/g, '\n'),
  })
  return new DfnsApiClient({
    baseUrl: requireEnv('DFNS_API_URL'),
    authToken: requireEnv('DFNS_APPROVER_AUTH_TOKEN'),
    signer,
    ...(process.env.DFNS_ORG_ID ? { orgId: process.env.DFNS_ORG_ID } : {}),
  })
}
