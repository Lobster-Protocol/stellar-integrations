import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { relayFetch } from './relay'
import { operatorHeaders } from './operator'
import { useActiveProfile } from './use-profiles'

const NS = 'dfns'
const STALE = 60_000

// The status matters to the caller: a 401 means the relay answered and turned
// the read down, which is a different story from a relay nobody can reach.
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

// The relay forwards the DFNS policy objects verbatim, so the rule configuration
// (amount limit, recipient list) and the approval quorum ride along. Kept optional
// because a rule like AlwaysTrigger carries no configuration and a Block/NoAction
// action carries no group.
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

// every read keys on the active profile id, so switching profiles never serves one
// client's wallets/policies/approvals from another's cache, and reads are off until
// a profile is selected.
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
    mutationFn: async (args: { name: string; network: 'Stellar' | 'StellarTestnet' }): Promise<DfnsWalletSummary> =>
      fetchJson('/dfns/wallets', {
        method: 'POST',
        body: JSON.stringify(args),
        headers: operatorHeaders(),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [NS, p?.id ?? 'none', 'wallets'] }),
  })
}
