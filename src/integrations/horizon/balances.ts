import { Horizon, NotFoundError } from '@stellar/stellar-sdk'
import type { Network } from '../../config/contracts'
import { getHorizonServer } from './client'

type BalanceLine = Horizon.HorizonApi.BalanceLine
type BalanceLineAsset = Horizon.HorizonApi.BalanceLineAsset

export interface AccountBalance {
  code: string
  issuer?: string
  balance: string
  isNative: boolean
}

function isBalanceLineWithCode(b: BalanceLine): b is BalanceLineAsset {
  return b.asset_type === 'credit_alphanum4' || b.asset_type === 'credit_alphanum12'
}

function mapBalance(b: BalanceLine): AccountBalance | null {
  if (b.asset_type === 'native') {
    return { code: 'XLM', balance: b.balance, isNative: true }
  }
  if (isBalanceLineWithCode(b)) {
    return {
      code: b.asset_code,
      issuer: b.asset_issuer,
      balance: b.balance,
      isNative: false,
    }
  }
  // skip liquidity pool share lines - dashboard cares about asset holdings
  return null
}

export async function getAccountBalances(
  network: Network,
  accountId: string,
): Promise<AccountBalance[]> {
  const server = getHorizonServer(network)
  try {
    const account = await server.loadAccount(accountId)
    return account.balances
      .map((b) => mapBalance(b))
      .filter((b): b is AccountBalance => b !== null)
  } catch (err) {
    // account not on-chain on this network - empty list is the right answer
    if (err instanceof NotFoundError) return []
    throw err
  }
}
