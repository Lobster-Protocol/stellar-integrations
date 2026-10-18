import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { relayFetch } from './relay'
import { operatorHeaders } from './operator'
import { useActiveProfile } from './use-profiles'
import type { DfnsNetwork } from './profiles'

const NS = 'dfns'
const STALE = 60_000

// keeps the status: a 401 is a relay that answered and refused, not one that is down.
export class RelayError extends Error {
  readonly status: number

  constructor(status: number, path: string) {
    super(
      status === 401
        ? 'The custody relay answered, but it refused this read: this build has no valid API token.'
        : status === 503
          ? 'The custody relay is running but is not configured to answer this yet.'
          : `The custody relay answered ${status} for ${path}.`,
    )
    this.status = status
  }
}

async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await relayFetch(path, init)
  if (!res.ok) throw new RelayError(res.status, path)
  return res.json() as Promise<T>
}

export interface DfnsApprovalGroup {
  name?: string
  quorum?: number
  approvers?: { userId?: { in?: string[] } }
}

// forwarded verbatim from dfns. optional because AlwaysTrigger carries no
// configuration and a Block/NoAction action carries no approval group.
export interface DfnsPolicySummary {
  id: string
  name: string
  status: string
  activityKind: string
  rule: { kind: string; configuration?: Record<string, unknown> }
  action: { kind: string; approvalGroups?: DfnsApprovalGroup[]; autoRejectTimeout?: number }
}

export interface DfnsWalletSummary {
  id: string
  address: string
  name: string
  network: string
}

// keyed on the profile id so a switch never serves another client's cached data.
export function useDfnsPolicies() {
  const p = useActiveProfile()
  return useQuery<{ items: DfnsPolicySummary[] }>({
    queryKey: [NS, p?.id ?? 'none', 'policies'],
    queryFn: () => fetchJson('/dfns/policies'),
    staleTime: STALE,
    enabled: !!p,
  })
}

export function useDfnsWallets() {
  const p = useActiveProfile()
  return useQuery<{ items: DfnsWalletSummary[] }>({
    queryKey: [NS, p?.id ?? 'none', 'wallets'],
    queryFn: () => fetchJson('/dfns/wallets'),
    staleTime: STALE,
    enabled: !!p,
  })
}

export interface DfnsApproval {
  id: string
  status: string
  activityKind: string
  initiatorUserId?: string
  dateCreated?: string
  expirationDate?: string
}

export function useDfnsPendingApprovals() {
  const p = useActiveProfile()
  return useQuery<{ items: DfnsApproval[] }>({
    queryKey: [NS, p?.id ?? 'none', 'approvals', 'pending'],
    queryFn: () => fetchJson('/dfns/approvals'),
    staleTime: 15_000,
    refetchInterval: 30_000,
    enabled: !!p,
  })
}

export function useDfnsApprove() {
  const qc = useQueryClient()
  const p = useActiveProfile()
  return useMutation({
    mutationFn: async (args: { approvalId: string; value: 'Approved' | 'Denied'; reason?: string }) =>
      fetchJson(`/dfns/approvals/${args.approvalId}/decision`, {
        method: 'POST',
        body: JSON.stringify({ value: args.value, reason: args.reason }),
        headers: operatorHeaders(),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [NS, p?.id ?? 'none', 'approvals'] }),
  })
}

export function useCreateDfnsWallet() {
  const qc = useQueryClient()
  const p = useActiveProfile()
  return useMutation({
    mutationFn: async (args: { name: string; network: DfnsNetwork }): Promise<DfnsWalletSummary> =>
      fetchJson('/dfns/wallets', {
        method: 'POST',
        body: JSON.stringify(args),
        headers: operatorHeaders(),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [NS, p?.id ?? 'none', 'wallets'] }),
  })
}
