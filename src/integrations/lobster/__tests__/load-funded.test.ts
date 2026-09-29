import { describe, it, expect } from 'vitest'
import type { rpc } from '@stellar/stellar-sdk'

import { loadFunded } from '../client'

const WALLET = 'GAMNA2Q6NTZSUBLMEXLTIXYORE7OXJJBMEGIX7T2OXDAKIA7CCKN4RJV'
// what the soroban rpc throws for an account that was never funded
const unfunded = { getAccount: async () => Promise.reject(new Error(`Account not found: ${WALLET}`)) } as unknown as rpc.Server

describe('loadFunded', () => {
  it('points a testnet wallet at friendbot', async () => {
    await expect(loadFunded(unfunded, WALLET, 'testnet')).rejects.toThrow(
      'This wallet is not funded on testnet yet. Add some XLM (use friendbot on testnet) to cover the network fee, then try again.',
    )
  })

  it('does not send a mainnet wallet to a testnet faucet', async () => {
    await expect(loadFunded(unfunded, WALLET, 'mainnet')).rejects.toThrow(
      'This wallet is not funded on mainnet yet. Add some XLM to cover the network fee, then try again.',
    )
  })

  it('lets any other failure through as it is', async () => {
    const down = { getAccount: async () => Promise.reject(new Error('socket hang up')) } as unknown as rpc.Server
    await expect(loadFunded(down, WALLET, 'mainnet')).rejects.toThrow('socket hang up')
  })
})
