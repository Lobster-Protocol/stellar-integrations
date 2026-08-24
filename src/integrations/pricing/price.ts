import { useQuery } from '@tanstack/react-query'

import { quoteBroker } from '../broker/quote'
import { quoteSoroswapDirect } from '../broker/soroswap-fallback'
import { CONTRACTS, type Network } from '../../config/contracts'
import type { AccountBalance } from '../horizon/account'

export interface ValuedBalance extends AccountBalance {
  usd: number | null
}

// Value held balances: XLM at the live quote, USDC at par, anything else stays
// unpriced. USDC counts at par only against the network's canonical id, so a
// look-alike token sharing the code can't inflate the total. That id is the
// classic issuer on mainnet and the SAC on testnet, where USDC only exists as a
// soroban token. usdTotal is null when nothing could be priced, which tells the
// caller to show native units instead of a total.
export function valueBalances(
  balances: AccountBalance[],
  xlmPrice: number | null,
  network: Network,
): { lines: ValuedBalance[]; usdTotal: number | null } {
  const { usdcIssuer, usdcSac } = CONTRACTS[network].tokens
  const canonicalUsdc = usdcIssuer || usdcSac
  let total = 0
  let anyPriced = false
  const lines = balances.map((b) => {
    let usd: number | null = null
    if (b.isNative && xlmPrice != null) usd = Number(b.balance) * xlmPrice
    else if (b.code === 'USDC' && !!canonicalUsdc && b.issuer === canonicalUsdc) {
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

// donut slices for the held lines. mixing dollars (priced lines) with raw token
// counts (unpriced) in one pie distorts the split, so when anything is priced
// (mainnet) weight purely by USD and drop what we cannot price; only when
// nothing is priced (testnet) fall back to token amount, where every slice is
// at least the same kind of number.
export function allocationWeights(lines: ValuedBalance[]): { name: string; value: number }[] {
  const held = lines.filter((l) => Number(l.balance) > 0)
  const priced = held.filter((l) => l.usd != null && l.usd > 0)
  if (priced.length > 0) return priced.map((l) => ({ name: l.code, value: l.usd as number }))
  return held.map((l) => ({ name: l.code, value: Number(l.balance) }))
}

// A price is always one XLM expressed in the network's USDC. On mainnet that is
// a dollar figure; on testnet the same quote is denominated in a test USDC that
// is not money, so the unit is named rather than dressed up as dollars.
export type PriceUnit = 'USD' | 'USDC'

export function priceUnit(network: Network): PriceUnit {
  return network === 'mainnet' ? 'USD' : 'USDC'
}

// Mainnet goes through the broker, which aggregates every venue. Testnet has no
// broker, but Soroswap runs there with a real XLM/USDC pool, so the router
// quotes a real price off real reserves. Null when neither answers, so callers
// fall back to native units instead of inventing a figure.
export async function fetchXlmPrice(network: Network): Promise<number | null> {
  if (network === 'mainnet') {
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

// Vault legs are token contract ids rather than asset codes, so pricing them
// needs the SAC registry rather than the balance line. Anything outside the two
// canonical ids has no price we can stand behind and returns null.
export function tokenPricer(network: Network, xlmPrice: number | null) {
  const { xlmSac, usdcSac } = CONTRACTS[network].tokens
  return (tokenId: string): number | null => {
    if (tokenId && tokenId === xlmSac) return xlmPrice
    if (tokenId && tokenId === usdcSac) return 1
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
