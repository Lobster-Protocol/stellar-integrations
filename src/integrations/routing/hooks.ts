import { useQuery } from '@tanstack/react-query'

import { routeSwap, type RouteResult } from './route'
import type { Network } from '../../config/contracts'
import type { BrokerQuoteParams } from '../broker/types'

const NS = 'routing'
// matches the 10s ttl the broker sdk enforces inside confirmQuote
const STALE_ROUTE = 10_000

export function useSwapRoute(
  params: BrokerQuoteParams | null,
  account: string | null,
  network: Network,
) {
  return useQuery<RouteResult>({
    queryKey: [
      NS,
      'swap',
      network,
      account ?? null,
      params?.sellingAsset ?? null,
      params?.buyingAsset ?? null,
      params?.sellingAmount ?? null,
      params?.slippageTolerance ?? null,
    ],
    queryFn: async () => {
      if (!params || !account) return { source: 'none', reason: 'missing params or account' }
      return routeSwap(params, { network, callerAccount: account })
    },
    enabled: !!params && !!account,
    staleTime: STALE_ROUTE,
  })
}
