import { useQuery } from '@tanstack/react-query'

import { CONTRACTS, type Network } from '../../config/contracts'
import { Address, type xdr } from '@stellar/stellar-sdk'

import { simulateRead, contractErrorCode } from '../stellar/read'
import { stroopsToDecimal } from '../stellar/amount'
import { getPoolsByUser } from './factory'
import { useAccountExists } from '../horizon/account'

export type Venue = 'soroswap' | 'phoenix' | 'aquarius' | 'idle'

// ACT_DEX values written by the vault. Soroswap/Phoenix/Aquarius come from the
// add_liquidity_* paths; 5 is what the constructor sets and what every withdraw
// restores, meaning the tokens sit in the vault rather than in a pool.
const VENUE: Record<number, Venue> = {
  0: 'soroswap',
  1: 'phoenix',
  2: 'aquarius',
  5: 'idle',
}

export const VENUE_LABEL: Record<Venue, string> = {
  soroswap: 'Soroswap',
  phoenix: 'Phoenix',
  aquarius: 'Aquarius',
  idle: 'Held in vault',
}

// the vault raises this when asked for a pool it has not deployed into
const NO_ACTIVE_POSITION = 563

export interface VaultPosition {
  address: string
  owner: string
  token0: string
  token1: string
  venue: Venue
  // sitting in the vault itself, waiting to be put to work
  amount0: string
  amount1: string
  // what the vault's share of the pool represents, null while it holds no
  // position or when the pool would not answer
  pooled0: string | null
  pooled1: string | null
  poolAddress: string | null
  lpShares: string | null
  // true when the vault answered every read we asked of it
  complete: boolean
}

const LP_GETTER: Record<Exclude<Venue, 'idle'>, string> = {
  soroswap: 'get_lp_soroswap',
  phoenix: 'get_lp_phoenix',
  aquarius: 'get_lp_aquarius',
}

// get_amounts_tokens is documented as the balances held "not in pools", so on a
// vault that is working it reads close to zero. What the position is actually
// worth comes from the pool: these return the vault's share of the reserves.
const POOLED_GETTER: Record<Exclude<Venue, 'idle'>, string> = {
  soroswap: 'get_amounts_from_soroswap',
  phoenix: 'get_amounts_from_phoenix',
  aquarius: 'get_amounts_from_aquarius',
}

async function readVault(
  network: Network,
  source: string,
  pool: { lobsterAddress: string; owner: string; token0: string; token1: string },
): Promise<VaultPosition> {
  const read = <T>(method: string, args?: xdr.ScVal[]) =>
    simulateRead<T>(network, source, pool.lobsterAddress, method, args)

  const base = {
    address: pool.lobsterAddress,
    owner: pool.owner,
    token0: pool.token0,
    token1: pool.token1,
  }

  const [protocolRaw, amounts] = await Promise.all([
    read<bigint>('get_active_protocol'),
    read<[bigint, bigint]>('get_amounts_tokens'),
  ])

  const venue = VENUE[Number(protocolRaw)] ?? 'idle'
  const position: VaultPosition = {
    ...base,
    venue,
    amount0: stroopsToDecimal(amounts[0]),
    amount1: stroopsToDecimal(amounts[1]),
    pooled0: null,
    pooled1: null,
    poolAddress: null,
    lpShares: null,
    complete: true,
  }

  if (venue === 'idle') return position

  try {
    // the pool address comes first: every other read of a working vault takes it
    const poolAddress = await read<string>('get_actual_pool')
    position.poolAddress = poolAddress
    const arg = [new Address(poolAddress).toScVal()]

    const [lp, pooled] = await Promise.all([
      read<bigint | [bigint, string]>(LP_GETTER[venue], arg),
      read<[bigint, bigint]>(POOLED_GETTER[venue], arg),
    ])
    position.lpShares = stroopsToDecimal(Array.isArray(lp) ? lp[0] : lp)
    position.pooled0 = stroopsToDecimal(pooled[0])
    position.pooled1 = stroopsToDecimal(pooled[1])
  } catch (err) {
    // a vault that reports a venue but refuses the pool read is in a state we
    // cannot describe, so say so rather than show it as empty
    if (contractErrorCode(err) !== NO_ACTIVE_POSITION) position.complete = false
  }

  return position
}

export async function getVaultPositions(
  network: Network,
  user: string,
): Promise<VaultPosition[]> {
  const pools = await getPoolsByUser(network, user)
  if (pools.length === 0) return []
  const source = user || CONTRACTS[network].lobster.readSource
  // one vault whose storage TTL expired (or hits a transient rpc error) must not
  // hide the healthy ones, so settle each independently and flag a failed read
  // instead of rejecting the whole list.
  const settled = await Promise.allSettled(pools.map((p) => readVault(network, source, p)))
  return settled.map((r, i) =>
    r.status === 'fulfilled'
      ? r.value
      : {
          address: pools[i].lobsterAddress,
          owner: pools[i].owner,
          token0: pools[i].token0,
          token1: pools[i].token1,
          venue: 'idle' as const,
          amount0: '0',
          amount1: '0',
          pooled0: null,
          pooled1: null,
          poolAddress: null,
          lpShares: null,
          complete: false,
        },
  )
}

export function useVaultPositions(network: Network, user: string | null) {
  // an unfunded wallet is not on-chain and owns no vaults, so skip the read
  // until balances confirm the account exists rather than 404 for nothing.
  const exists = useAccountExists(network, user) === 'live'
  return useQuery({
    queryKey: ['lobster', 'vaults', network, user],
    queryFn: () => getVaultPositions(network, user!),
    enabled: !!user && exists,
    staleTime: 30_000,
    retry: 1,
  })
}

// Everything a vault controls, token by token: what sits in it, plus what its
// pool position represents. A vault that is working holds almost nothing
// directly, so counting only the first would report a live position as empty.
export function vaultLegs(p: VaultPosition): Array<[string, string]> {
  const legs: Array<[string, string]> = [
    [p.token0, p.amount0],
    [p.token1, p.amount1],
  ]
  if (p.pooled0) legs.push([p.token0, p.pooled0])
  if (p.pooled1) legs.push([p.token1, p.pooled1])
  return legs
}

// A vault holding nothing, neither in itself nor in a pool, is clutter on a
// list. Tested against every leg rather than the idle balance alone, so a
// working position is never mistaken for an empty one.
export function isVaultEmpty(p: VaultPosition): boolean {
  return vaultLegs(p).every(([, amount]) => Number(amount) === 0)
}

// The last time the owner moved anything on each vault, taken from the activity
// already read. A vault missing from the map has had no move in the operations
// loaded so far, which is not the same as never, so callers show nothing rather
// than claim it has been idle forever.
export function lastMoveByVault(
  events: Array<{ at: string; contractId?: string; moves: Array<{ counterparty?: string }> }>,
): Map<string, string> {
  const seen = new Map<string, string>()
  for (const e of events) {
    const touched = new Set<string>()
    if (e.contractId) touched.add(e.contractId)
    for (const m of e.moves) if (m.counterparty?.startsWith('C')) touched.add(m.counterparty)
    for (const id of touched) {
      const prev = seen.get(id)
      if (!prev || e.at > prev) seen.set(id, e.at)
    }
  }
  return seen
}

// Value a vault leg by leg. Only tokens we have a price for contribute, so a
// pair with one unpriceable side reports what it can and flags the rest. A
// working vault whose pool would not answer is flagged too: its total is short
// by whatever the position holds, and saying so beats quoting a number that is
// missing most of it.
export function valueVault(
  p: VaultPosition,
  priceOf: (tokenId: string) => number | null,
): { value: number; partial: boolean } {
  let value = 0
  let partial = p.venue !== 'idle' && (p.pooled0 === null || p.pooled1 === null)
  for (const [id, amount] of vaultLegs(p)) {
    const price = priceOf(id)
    if (price == null) {
      if (Number(amount) > 0) partial = true
      continue
    }
    value += Number(amount) * price
  }
  return { value, partial }
}
