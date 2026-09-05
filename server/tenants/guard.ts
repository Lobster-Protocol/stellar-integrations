import { DEMO_TENANT_ID } from './demo'
import type { Tenant } from './types'

// the north-star invariant as a checked guard, not a label: the demo tenant is a
// shared sandbox and can never stand in as a client's own custody. two ways that
// could happen, both refused here.
//
// this is about tenant identity, not network. our demo org has legitimately
// signed mainnet for Lobster's own treasury (the grant D3.AC2 swap), so the guard
// must not block the demo tenant from mainnet; it blocks the demo tenant from
// being resolved or reused AS a different client.

// a request scoped to a client tenant must not resolve to the demo tenant. once
// client tenants exist, resolving the wrong one is a cross-tenant breach.
export function assertResolvedTenant(requestedId: string, resolved: Tenant): void {
  if (requestedId !== resolved.id) {
    throw new Error(`tenant ${requestedId} resolved to ${resolved.id}`)
  }
  if (requestedId !== DEMO_TENANT_ID && resolved.kind === 'demo') {
    throw new Error('the Lobster demo custody cannot act as a client tenant')
  }
}

// a new client tenant may not reuse the demo fixture's identifiers. a client
// whose cred, token or treasury equals ours would route its funds through our
// signer, which is the exact confusion this whole separation exists to prevent.
export function assertDistinctFromDemo(candidate: Tenant, demo: Tenant): void {
  if (candidate.id === DEMO_TENANT_ID || candidate.kind === 'demo') {
    throw new Error('a client tenant cannot use the reserved demo id or kind')
  }
  const sameCred = candidate.dfns.credId === demo.dfns.credId
  const sameToken = candidate.dfns.authToken === demo.dfns.authToken
  const sameWallet =
    !!candidate.treasury && !!demo.treasury && candidate.treasury.walletId === demo.treasury.walletId
  if (sameCred || sameToken || sameWallet) {
    throw new Error('a client tenant cannot reuse the demo custody credentials or treasury')
  }
}
