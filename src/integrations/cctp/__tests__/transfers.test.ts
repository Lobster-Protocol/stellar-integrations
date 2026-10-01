import { describe, it, expect, beforeEach } from 'vitest'

import {
  directionOf,
  markAttested,
  trackTransfer,
  markDelivered,
  forgetTransfer,
  listTransfers,
  type TrackedTransfer,
} from '../transfers'

function transfer(over: Partial<TrackedTransfer> = {}): TrackedTransfer {
  return {
    id: `0x${'aa'.repeat(32)}`,
    network: 'testnet',
    chainKey: 'BASE',
    chainName: 'Base Sepolia',
    sourceDomain: 6,
    amount: '5',
    recipient: 'GAMNA2Q6NTZSUBLMEXLTIXYORE7OXJJBMEGIX7T2OXDAKIA7CCKN4RJV',
    finality: 'fast',
    createdAt: 1,
    stage: 'burned',
    ...over,
  }
}

beforeEach(() => localStorage.clear())

describe('tracked transfers', () => {
  it('keeps a burned transfer until it is delivered', () => {
    trackTransfer(transfer())
    expect(listTransfers('testnet')).toHaveLength(1)
    expect(listTransfers('testnet')[0].stage).toBe('burned')
  })

  it('records the Stellar hash once the USDC lands', () => {
    trackTransfer(transfer())
    markDelivered('testnet', transfer().id, 'deadbeef')
    expect(listTransfers('testnet')[0]).toMatchObject({ stage: 'delivered', deliveredHash: 'deadbeef' })
  })

  it('never shows a testnet transfer on mainnet', () => {
    trackTransfer(transfer())
    expect(listTransfers('mainnet')).toEqual([])
  })

  it('does not duplicate a transfer tracked twice', () => {
    trackTransfer(transfer())
    trackTransfer(transfer({ amount: '6' }))
    const list = listTransfers('testnet')
    expect(list).toHaveLength(1)
    expect(list[0].amount).toBe('6')
  })

  it('forgets on request', () => {
    trackTransfer(transfer())
    forgetTransfer('testnet', transfer().id)
    expect(listTransfers('testnet')).toEqual([])
  })

  it('survives storage that was edited into nonsense', () => {
    localStorage.setItem('lob_cctp_transfers_testnet', '{not json')
    expect(listTransfers('testnet')).toEqual([])
    localStorage.setItem('lob_cctp_transfers_testnet', JSON.stringify([{ id: 1 }, null, 'x']))
    expect(listTransfers('testnet')).toEqual([])
  })

  it('reads an entry saved before the way back existed as a transfer into Stellar', () => {
    trackTransfer(transfer())
    expect(directionOf(listTransfers('testnet')[0])).toBe('to-stellar')
    expect(directionOf(transfer({ direction: 'from-stellar' }))).toBe('from-stellar')
  })

  it('keeps the first time Circle was seen signing', () => {
    trackTransfer(transfer())
    markAttested('testnet', transfer().id, 100)
    markAttested('testnet', transfer().id, 200)
    expect(listTransfers('testnet')[0].attestedAt).toBe(100)
  })

  it('records when it landed, and keeps a known hash when the next look has none', () => {
    trackTransfer(transfer({ deliveredHash: 'cafe' }))
    markDelivered('testnet', transfer().id, '')
    const t = listTransfers('testnet')[0]
    expect(t).toMatchObject({ stage: 'delivered', deliveredHash: 'cafe' })
    expect(typeof t.deliveredAt).toBe('number')
  })

  it('leaves the list alone for a transfer it does not hold', () => {
    trackTransfer(transfer())
    markDelivered('testnet', 'unknown', 'x')
    markAttested('testnet', 'unknown')
    expect(listTransfers('testnet')[0].stage).toBe('burned')
  })
})
