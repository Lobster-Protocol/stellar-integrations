import { useQuery } from '@tanstack/react-query'

import { quoteBroker } from '../broker/quote'
import { CONTRACTS, type Network } from '../../config/contracts'
import type { AccountBalance } from '../horizon/account'

export interface ValuedBalance extends AccountBalance {
  usd: number | null
}

// Value held balances: XLM at the live price, USDC at one dollar, anything else
// stays unpriced. USDC counts at par only when it carries the network's canonical
// issuer, so a look-alike token sharing the code can't inflate the dollar total.
// usdTotal is null when nothing could be priced (e.g. testnet), which tells the
// caller to show native units instead of a dollar total.
export function valueBalances(
  balances: AccountBalance[],
  xlmUsd: number | null,
  network: Network,
): { lines: ValuedBalance[]; usdTotal: number | null } {
  const usdcIssuer = CONTRACTS[network].tokens.usdcIssuer
  let total = 0
  let anyPriced = false
  const lines = balances.map((b) => {
    let usd: number | null = null
    if (b.isNative && xlmUsd != null) usd = Number(b.balance) * xlmUsd
    else if (b.code === 'USDC' && !!usdcIssuer && b.issuer === usdcIssuer) usd = Number(b.balance)
    if (usd != null && Number.isFinite(usd)) {
      total += usd
      anyPriced = true
    }
    return { ...b, usd }
  })
  return { lines, usdTotal: anyPriced ? total : null }
}

// donut slices for the held lines, weighted by USD where priced and by raw
// token amount otherwise, so the split works on mainnet and testnet alike.
export function allocationWeights(lines: ValuedBalance[]): { name: string; value: number }[] {
  return lines
    .filter((l) => Number(l.balance) > 0)
    .map((l) => ({ name: l.code, value: l.usd ?? Number(l.balance) }))
}

// XLM/USD comes from a live broker quote of one XLM into USDC. Mainnet only:
// the broker runs on mainnet, and testnet assets have no market price. Returns
// null when there is no price, so a caller shows native units rather than a made
// up dollar figure. USDC is treated as one dollar.
const STALE_PRICE = 30_000

export async function fetchXlmUsd(network: Network): Promise<number | null> {
  if (network !== 'mainnet') return null
  const issuer = CONTRACTS.mainnet.tokens.usdcIssuer
  if (!issuer) return null
  const quote = await quoteBroker({
    sellingAsset: 'xlm',
    buyingAsset: `USDC-${issuer}`,
    sellingAmount: '1',
    slippageTolerance: 0.02,
  })
  if (!quote || quote.status !== 'success') return null
  const price = Number(quote.estimatedBuyingAmount)
  return Number.isFinite(price) && price > 0 ? price : null
}

export function useXlmUsd(network: Network) {
  return useQuery<number | null>({
    queryKey: ['price', 'xlm-usd', network],
    queryFn: () => fetchXlmUsd(network),
    staleTime: STALE_PRICE,
    retry: 1,
  })
}
