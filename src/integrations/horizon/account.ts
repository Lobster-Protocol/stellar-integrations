import { useQuery } from '@tanstack/react-query'
import { Horizon, NotFoundError } from '@stellar/stellar-sdk'
import { CONTRACTS, type Network } from '../../config/contracts'
import { getHorizonServer } from './client'
import { getSorobanTokenBalance } from '../stellar/token-balance'
import { stroopsToDecimal } from '../stellar/amount'

type BalanceLine = Horizon.HorizonApi.BalanceLine

export interface AccountBalance {
  code: string
  issuer?: string
  balance: string
  isNative: boolean
}

function mapBalance(b: BalanceLine): AccountBalance | null {
  if (b.asset_type === 'native') {
    return { code: 'XLM', balance: b.balance, isNative: true }
  }
  if (b.asset_type === 'credit_alphanum4' || b.asset_type === 'credit_alphanum12') {
    return {
      code: b.asset_code,
      issuer: b.asset_issuer,
      balance: b.balance,
      isNative: false,
    }
  }
  // skip liquidity pool shares - we only show asset holdings
  return null
}

export async function getAccountBalances(
  network: Network,
  accountId: string,
): Promise<AccountBalance[]> {
  const server = getHorizonServer(network)
  let classic: AccountBalance[]
  try {
    const account = await server.loadAccount(accountId)
    classic = account.balances
      .map((b) => mapBalance(b))
      .filter((b): b is AccountBalance => b !== null)
  } catch (err) {
    if (isAccountMissing(err)) return []
    throw err
  }

  // Horizon lists only classic balances, so testnet's soroban-only USDC is read
  // from the SAC; on mainnet the SAC wraps the classic trustline already listed
  const usdcSac = CONTRACTS[network].tokens.usdcSac
  if (usdcSac && !classic.some((b) => b.code === 'USDC')) {
    const raw = await getSorobanTokenBalance(network, usdcSac, accountId)
    if (raw !== null) {
      classic.push({ code: 'USDC', issuer: usdcSac, balance: stroopsToDecimal(raw), isNative: false })
    }
  }
  return classic
}

export function useAccountBalances(network: Network, accountId: string | null) {
  return useQuery({
    queryKey: ['horizon', 'balances', network, accountId],
    queryFn: () => getAccountBalances(network, accountId!),
    enabled: !!accountId,
    staleTime: 20_000,
    retry: 1,
  })
}

// an unfunded account is not on-chain yet: Horizon answers 404 and the soroban
// rpc throws Error("Account not found: G..."), and neither is a real fault
export function isAccountMissing(err: unknown): boolean {
  if (err instanceof NotFoundError) return true
  if (err && typeof err === 'object') {
    const status = (err as { response?: { status?: number } }).response?.status
    if (status === 404) return true
    const msg = (err as { message?: unknown }).message
    if (typeof msg === 'string' && /account not found/i.test(msg)) return true
  }
  return false
}

export type AccountExistence = 'unknown' | 'missing' | 'live'

// derived from the balances query at no extra request: a live account always
// lists its native XLM, and a Horizon outage stays 'unknown', not 'missing'
export function useAccountExists(network: Network, accountId: string | null): AccountExistence {
  const balances = useAccountBalances(network, accountId)
  if (!accountId) return 'unknown'
  if (balances.isError) return 'unknown'
  if (balances.isSuccess) return balances.data.length > 0 ? 'live' : 'missing'
  return 'unknown'
}
