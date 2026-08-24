import { useQuery } from '@tanstack/react-query'

import { CONTRACTS, type Network } from '../../config/contracts'
import { simulateRead, contractErrorCode } from '../stellar/read'
import { stroopsToDecimal } from '../stellar/amount'
import { getPoolsByUser } from './factory'

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
  amount0: string
  amount1: string
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

async function readVault(
  network: Network,
  source: string,
  pool: { lobsterAddress: string; owner: string; token0: string; token1: string },
): Promise<VaultPosition> {
  const read = <T>(method: string) => simulateRead<T>(network, source, pool.lobsterAddress, method)

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
    poolAddress: null,
    lpShares: null,
    complete: true,
  }

  if (venue === 'idle') return position

  try {
    const [poolAddress, lp] = await Promise.all([
      read<string>('get_actual_pool'),
      read<bigint | [bigint, string]>(LP_GETTER[venue]),
    ])
    position.poolAddress = poolAddress
    position.lpShares = stroopsToDecimal(Array.isArray(lp) ? lp[0] : lp)
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
  return Promise.all(pools.map((p) => readVault(network, source, p)))
}

export function useVaultPositions(network: Network, user: string | null) {
  return useQuery({
    queryKey: ['lobster', 'vaults', network, user],
    queryFn: () => getVaultPositions(network, user!),
    enabled: !!user,
    staleTime: 30_000,
    retry: 1,
  })
}

// Value a vault leg by leg. Only tokens we have a price for contribute, so a
// pair with one unpriceable side reports what it can and flags the rest.
export function valueVault(
  p: VaultPosition,
  priceOf: (tokenId: string) => number | null,
): { value: number; partial: boolean } {
  const legs: Array<[string, string]> = [
    [p.token0, p.amount0],
    [p.token1, p.amount1],
  ]
  let value = 0
  let partial = false
  for (const [id, amount] of legs) {
    const price = priceOf(id)
    if (price == null) {
      if (Number(amount) > 0) partial = true
      continue
    }
    value += Number(amount) * price
  }
  return { value, partial }
}
