import type { DfnsStellarNetwork } from '../dfns/types'
import type { SignGuardConfig } from '../dfns/sign-guard'

export type TenantKind = 'demo' | 'client'

// the credentials the relay uses to act on ONE dfns org. for the demo tenant
// these come from process.env; a client tenant's come from the store (kms-wrapped
// once that lands). privateKey is a PEM held in memory only, never logged, never
// written back to disk.
export interface TenantDfnsCreds {
  baseUrl: string
  authToken: string
  credId: string
  privateKey: string
  // set the org scope so the dfns sdk refuses a request whose auth token is not
  // that org's, which is the check that stops one signer acting on another org.
  orgId?: string
}

export interface TenantTreasury {
  walletId: string
  network: DfnsStellarNetwork
}

export interface Tenant {
  id: string
  kind: TenantKind
  label: string
  dfns: TenantDfnsCreds
  // null until the tenant designates a treasury wallet on a network, the same
  // gap the routes already answer with a 503.
  treasury: TenantTreasury | null
  guard: SignGuardConfig | null
}

// what a read endpoint may return: identity and placement, never a secret.
export interface TenantSummary {
  id: string
  kind: TenantKind
  label: string
  network: DfnsStellarNetwork | null
  treasuryWalletId: string | null
}

export function redactTenant(t: Tenant): TenantSummary {
  return {
    id: t.id,
    kind: t.kind,
    label: t.label,
    network: t.treasury?.network ?? null,
    treasuryWalletId: t.treasury?.walletId ?? null,
  }
}
