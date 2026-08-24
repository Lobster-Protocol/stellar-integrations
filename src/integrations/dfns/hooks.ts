import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { relayFetch } from './relay'

const NS = 'dfns'
const STALE = 60_000

async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await relayFetch(path, init)
  if (!res.ok) throw new Error(`${path} ${res.status}`)
  return res.json() as Promise<T>
}

export interface DfnsPolicySummary {
  id: string
  name: string
  status: string
  activityKind: string
  rule: { kind: string }
  action: { kind: string }
}

export interface DfnsWalletSummary {
  id: string
  address: string
  name: string
  network: string
}

export function useDfnsPolicies() {
  return useQuery<{ items: DfnsPolicySummary[] }>({
    queryKey: [NS, 'policies'],
    queryFn: () => fetchJson('/dfns/policies'),
    staleTime: STALE,
    enabled: !!import.meta.env.VITE_LOBSTER_API_URL,
  })
}

export function useDfnsWallets() {
  return useQuery<{ items: DfnsWalletSummary[] }>({
    queryKey: [NS, 'wallets'],
    queryFn: () => fetchJson('/dfns/wallets'),
    staleTime: STALE,
    enabled: !!import.meta.env.VITE_LOBSTER_API_URL,
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
  return useQuery<{ items: DfnsApproval[] }>({
    queryKey: [NS, 'approvals', 'pending'],
    queryFn: () => fetchJson('/dfns/approvals'),
    staleTime: 15_000,
    refetchInterval: 30_000,
    enabled: !!import.meta.env.VITE_LOBSTER_API_URL,
  })
}

export function useDfnsApprove() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { approvalId: string; value: 'Approved' | 'Denied'; reason?: string }) =>
      fetchJson(`/dfns/approvals/${args.approvalId}/decision`, {
        method: 'POST',
        body: JSON.stringify({ value: args.value, reason: args.reason }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [NS, 'approvals'] }),
  })
}

export function useCreateDfnsWallet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: { name: string; network: 'Stellar' | 'StellarTestnet' }): Promise<DfnsWalletSummary> =>
      fetchJson('/dfns/wallets', {
        method: 'POST',
        body: JSON.stringify(args),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [NS, 'wallets'] }),
  })
}
