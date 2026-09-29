import type { DfnsStellarNetwork } from '../dfns/types'
import type { SignGuardConfig } from '../dfns/sign-guard'

export type TenantKind = 'demo' | 'client'

// privateKey is a PEM held in memory only: never logged, never written to disk.
export interface TenantDfnsCreds {
  baseUrl: string
  authToken: string
  credId: string
  privateKey: string
  // with the org scope set, the dfns sdk refuses a request whose auth token is
  // not that org's, so one signer cannot act on another org.
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
