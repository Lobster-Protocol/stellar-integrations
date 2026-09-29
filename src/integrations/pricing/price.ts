import { useQuery } from '@tanstack/react-query'

import { quoteBroker } from '../broker/quote'
import { quoteSoroswapDirect } from '../broker/soroswap-fallback'
import { CONTRACTS, type Network } from '../../config/contracts'
import type { AccountBalance } from '../horizon/account'

export interface ValuedBalance extends AccountBalance {
  usd: number | null
}

// the only ids counted as USDC at par, so a look-alike can't inflate a total:
// the network's own and Circle's, which the bridge mints (one issuer on mainnet)
export function usdcAtPar(network: Network): Set<string> {
  const { usdcIssuer, usdcSac } = CONTRACTS[network].tokens
  return new Set([usdcIssuer || usdcSac, CONTRACTS[network].cctp.usdcIssuer].filter(Boolean))
}

// usdTotal is null when nothing could be priced, which tells the caller to show
// native units instead of a total
export function valueBalances(
  balances: AccountBalance[],
  xlmPrice: number | null,
  network: Network,
): { lines: ValuedBalance[]; usdTotal: number | null } {
  const atPar = usdcAtPar(network)
  let total = 0
  let anyPriced = false
  const lines = balances.map((b) => {
    let usd: number | null = null
    if (b.isNative && xlmPrice != null) usd = Number(b.balance) * xlmPrice
    else if (b.code === 'USDC' && !!b.issuer && atPar.has(b.issuer)) {
      usd = Number(b.balance)
    }
    if (usd != null && Number.isFinite(usd)) {
      total += usd
      anyPriced = true
    }
    return { ...b, usd }
  })
  return { lines, usdTotal: anyPriced ? total : null }
}

// a price is one XLM in the network's USDC; on testnet that USDC is not money,
// so the unit is named rather than dressed up as dollars
export type PriceUnit = 'USD' | 'USDC'

export function priceUnit(network: Network): PriceUnit {
  return network === 'mainnet' ? 'USD' : 'USDC'
}

// the broker won't quote a trade under a dollar, so probe with a size it will
// price and divide; the unit price moves 0.1% between 8 and 1000 XLM
const MAINNET_PROBE_XLM = 100

// testnet has no broker, so it reads Soroswap's XLM/USDC pool instead; null when
// nothing answers, so callers show native units rather than invent a figure
export async function fetchXlmPrice(network: Network): Promise<number | null> {
  if (network === 'mainnet') {
    const issuer = CONTRACTS.mainnet.tokens.usdcIssuer
    if (!issuer) return null
    const quote = await quoteBroker({
      sellingAsset: 'xlm',
      buyingAsset: `USDC-${issuer}`,
      sellingAmount: String(MAINNET_PROBE_XLM),
      slippageTolerance: 0.02,
    })
    if (!quote || quote.status !== 'success') return null
    const total = Number(quote.estimatedBuyingAmount)
    if (!Number.isFinite(total) || total <= 0) return null
    return total / MAINNET_PROBE_XLM
  }

  const t = CONTRACTS.testnet
  const caller = t.lobster.readSource
  if (!caller || !t.tokens.xlmSac || !t.tokens.usdcSac) return null
  const out = await quoteSoroswapDirect({
    network: 'testnet',
    callerAccount: caller,
    sellingTokenId: t.tokens.xlmSac,
    buyingTokenId: t.tokens.usdcSac,
    amountInStroops: ONE_UNIT,
  })
  if (out === null || out <= 0n) return null
  return Number(out) / Number(ONE_UNIT)
}

const ONE_UNIT = 10_000_000n
const PRICE_STALE_MS = 30_000

// vault legs are token contract ids, not asset codes, so they price off the SAC
// registry; anything outside the canonical ids has no price we can stand behind
export function tokenPricer(network: Network, xlmPrice: number | null) {
  const { xlmSac, usdcSac } = CONTRACTS[network].tokens
  const circleUsdcSac = CONTRACTS[network].cctp.usdcSac
  return (tokenId: string): number | null => {
    if (tokenId && tokenId === xlmSac) return xlmPrice
    if (tokenId && (tokenId === usdcSac || tokenId === circleUsdcSac)) return 1
    return null
  }
}

export function useXlmPrice(network: Network) {
  return useQuery<number | null>({
    queryKey: ['price', 'xlm', network],
    queryFn: () => fetchXlmPrice(network),
    staleTime: PRICE_STALE_MS,
    retry: 1,
  })
}
