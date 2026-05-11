import { NotFoundError } from '@stellar/stellar-sdk'
import type { Network } from '../../config/contracts'
import { getHorizonServer } from './client'

export interface AccountOperation {
  id: string
  type: string
  createdAt: string
  transactionHash: string
  successful: boolean
}

export async function getRecentOperations(
  network: Network,
  accountId: string,
  limit = 10,
): Promise<AccountOperation[]> {
  const server = getHorizonServer(network)
  try {
    const page = await server.operations().forAccount(accountId).order('desc').limit(limit).call()
    return page.records.map((r) => ({
      id: r.id,
      type: r.type,
      createdAt: r.created_at,
      transactionHash: r.transaction_hash,
      successful: r.transaction_successful,
    }))
  } catch (err) {
    if (err instanceof NotFoundError) return []
    throw err
  }
}
