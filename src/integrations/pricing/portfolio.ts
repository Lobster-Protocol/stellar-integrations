import type { Network } from '../../config/contracts'
import { tokenLabel } from '../stellar/token-registry'
import { shortenAddress } from '../../utils/format'
import { valueVault, vaultLegs, VENUE_LABEL, type VaultPosition } from '../lobster/position'
import type { ValuedBalance } from './price'

export interface Slice {
  name: string
  value: number
}

export interface Portfolio {
  walletValue: number
  vaultValue: number
  total: number
  byAsset: Slice[]
  byVenue: Slice[]
  // balances we hold but cannot put a price on
  unpriced: ValuedBalance[]
  vaults: Array<{ vault: VaultPosition; value: number; partial: boolean }>
}

// One place decides what the portfolio is worth and how it splits, so Overview
// and Allocation cannot drift into showing different percentages for the same
// wallet. Unpriceable tokens are counted nowhere rather than at a made-up price;
// they are listed separately instead.
export function buildPortfolio(
  lines: ValuedBalance[],
  vaultPositions: VaultPosition[],
  priceOf: (tokenId: string) => number | null,
  network: Network,
): Portfolio {
  const held = lines.filter((l) => Number(l.balance) > 0)
  const walletValue = held.reduce((s, l) => s + (l.usd ?? 0), 0)
  const vaults = vaultPositions.map((v) => ({ vault: v, ...valueVault(v, priceOf) }))
  const vaultValue = vaults.reduce((s, v) => s + v.value, 0)

  const assets = new Map<string, number>()
  for (const l of held) {
    if (l.usd != null && l.usd > 0) assets.set(l.code, (assets.get(l.code) ?? 0) + l.usd)
  }
  for (const { vault } of vaults) {
    for (const [id, amount] of vaultLegs(vault)) {
      const p = priceOf(id)
      if (p == null) continue
      const v = Number(amount) * p
      if (v <= 0) continue
      // only canonical SACs carry a price, so the registry names them; the short
      // id is a fallback that should not come up
      const code = tokenLabel(id, network) ?? shortenAddress(id)
      assets.set(code, (assets.get(code) ?? 0) + v)
    }
  }

  const venues = new Map<string, number>()
  if (walletValue > 0) venues.set('Wallet', walletValue)
  for (const { vault, value } of vaults) {
    if (value <= 0) continue
    const label = VENUE_LABEL[vault.venue]
    venues.set(label, (venues.get(label) ?? 0) + value)
  }

  return {
    walletValue,
    vaultValue,
    total: walletValue + vaultValue,
    byAsset: [...assets.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value),
    byVenue: [...venues.entries()].map(([name, value]) => ({ name, value })),
    unpriced: held.filter((l) => l.usd == null),
    vaults,
  }
}

export function share(slice: Slice, all: Slice[]): number {
  const total = all.reduce((s, d) => s + d.value, 0)
  return total > 0 ? (slice.value / total) * 100 : 0
}
