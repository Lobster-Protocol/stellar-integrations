import { useQuery } from '@tanstack/react-query'
import type { Network } from '../../config/contracts'

export type TtlLevel = 'ok' | 'warn' | 'crit' | 'archived'

export interface TtlKeyStatus {
  key: string
  // instance, factory-code or vault-code, as the relay names what it watches
  kind?: string
  remainingLedgers: number
  remainingSeconds: number
  level: TtlLevel
}

export interface TtlReport {
  network: Network
  latestLedger: number
  statuses: TtlKeyStatus[]
}

// the bff runs the daemon's own scan; the front never calls getLedgerEntries
export function useTtlStatus(network: Network) {
  return useQuery<TtlReport>({
    queryKey: ['ttl', network],
    queryFn: async () => {
      const base = import.meta.env.VITE_LOBSTER_API_URL
      if (!base) throw new Error('VITE_LOBSTER_API_URL not set')
      const res = await fetch(`${base}/ttl?network=${network}`)
      if (!res.ok) {
        // keep the relay's sentence (no factory here, rpc down) so the card shows a reason
        const body = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(body?.error ?? `The storage feed answered ${res.status}.`)
      }
      return res.json() as Promise<TtlReport>
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    enabled: !!import.meta.env.VITE_LOBSTER_API_URL,
  })
}
