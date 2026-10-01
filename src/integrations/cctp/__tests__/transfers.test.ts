import { describe, it, expect, beforeEach } from 'vitest'

import {
  directionOf,
  markAttested,
  trackTransfer,
  markDelivered,
  markSent,
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

  it('keeps a mint sent before its receipt was read, as the delivery once the chain has it', () => {
    trackTransfer(transfer({ direction: 'from-stellar' }))
    markSent('testnet', transfer().id, '0xsent')
    expect(listTransfers('testnet')[0]).toMatchObject({ stage: 'burned', sentHash: '0xsent' })
    markDelivered('testnet', transfer().id, '')
    expect(listTransfers('testnet')[0]).toMatchObject({ stage: 'delivered', deliveredHash: '0xsent' })
  })

  it('prefers a hash the chain or Circle names, and drops a mint that reverted', () => {
    trackTransfer(transfer({ direction: 'from-stellar' }))
    markSent('testnet', transfer().id, '0xsent')
    markDelivered('testnet', transfer().id, '0xnamed')
    expect(listTransfers('testnet')[0].deliveredHash).toBe('0xnamed')
    trackTransfer(transfer({ id: 'b'.repeat(64), direction: 'from-stellar' }))
    markSent('testnet', 'b'.repeat(64), '0xreverted')
    markSent('testnet', 'b'.repeat(64), '')
    markDelivered('testnet', 'b'.repeat(64), '')
    expect(listTransfers('testnet').find((t) => t.id === 'b'.repeat(64))?.deliveredHash).toBeUndefined()
  })

  it('leaves the list alone for a transfer it does not hold', () => {
    trackTransfer(transfer())
    markDelivered('testnet', 'unknown', 'x')
    markAttested('testnet', 'unknown')
    expect(listTransfers('testnet')[0].stage).toBe('burned')
  })
})
