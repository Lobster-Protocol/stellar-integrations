import { describe, it, expect, beforeEach } from 'vitest'

import {
  directionOf,
  dropIntent,
  isSettled,
  listIntents,
  listSearches,
  listWallets,
  rememberWallet,
  walletsToSearch,
  markAttested,
  markSettled,
  orphanIntents,
  PAGE_SESSION,
  recordSearch,
  saveIntent,
  trackTransfer,
  markDelivered,
  markSent,
  forgetTransfer,
  listTransfers,
  type BurnIntent,
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

  it('lets old finished transfers go past the history it keeps, never one still on its way', () => {
    trackTransfer(transfer({ id: 'on-its-way', createdAt: 0 }))
    for (let i = 0; i < 60; i++) trackTransfer(transfer({ id: `done-${i}`, stage: 'delivered', createdAt: i + 1 }))
    const list = listTransfers('testnet')
    expect(list.some((t) => t.id === 'on-its-way')).toBe(true)
    expect(list.filter((t) => t.stage === 'delivered')).toHaveLength(50)
    expect(list.some((t) => t.id === 'done-59')).toBe(true)
    expect(list.some((t) => t.id === 'done-0')).toBe(false)
  })
})

function intent(over: Partial<BurnIntent> = {}): BurnIntent {
  return {
    id: 'intent-a',
    network: 'testnet',
    chainKey: 'BASE',
    chainName: 'Base Sepolia',
    amount: '5',
    units: '5000000',
    from: '0xDCD592A255323772f9B1EF5db83D2A0CFcF91a37',
    recipient: 'GAMNA2Q6NTZSUBLMEXLTIXYORE7OXJJBMEGIX7T2OXDAKIA7CCKN4RJV',
    finality: 'fast',
    startedAt: 1,
    session: 'a-page-that-closed',
    fromBlock: '100',
    txCount: 7,
    ...over,
  }
}

describe('burn intents', () => {
  it('keeps the burn a wallet was asked for until it is dropped', () => {
    saveIntent(intent())
    expect(listIntents('testnet')).toEqual([intent()])
    dropIntent('testnet', intent().id)
    expect(listIntents('testnet')).toEqual([])
  })

  it('leaves this page its own intents and looks only for those a closed page left', () => {
    saveIntent(intent({ id: 'mine', session: PAGE_SESSION }))
    saveIntent(intent({ id: 'left-behind' }))
    expect(orphanIntents(listIntents('testnet')).map((i) => i.id)).toEqual(['left-behind'])
  })

  it('never shows a testnet intent on mainnet, and survives storage edited into nonsense', () => {
    saveIntent(intent())
    expect(listIntents('mainnet')).toEqual([])
    localStorage.setItem('lob_cctp_intents_testnet', '{nope')
    expect(listIntents('testnet')).toEqual([])
  })
})

describe('what a search already knows', () => {
  it('remembers the burns it found arrived', () => {
    expect(isSettled('testnet', 'abc')).toBe(false)
    markSettled('testnet', ['abc'])
    expect(isSettled('testnet', 'abc')).toBe(true)
    expect(isSettled('mainnet', 'abc')).toBe(false)
  })

  it('keeps one record per wallet and chain searched', () => {
    recordSearch('testnet', 'evm:BASE:0xdcd5', { at: 1, head: '200', reachedFrom: '100', complete: true })
    recordSearch('testnet', 'stellar:GAMNA', { at: 2, complete: false, error: 'Horizon did not answer' })
    expect(listSearches('testnet')).toEqual({
      'evm:BASE:0xdcd5': { at: 1, head: '200', reachedFrom: '100', complete: true },
      'stellar:GAMNA': { at: 2, complete: false, error: 'Horizon did not answer' },
    })
    expect(listSearches('mainnet')).toEqual({})
  })
})

const EVM_A = '0xDCD592A255323772f9B1EF5db83D2A0CFcF91a37'
const G_A = 'GAMNA2Q6NTZSUBLMEXLTIXYORE7OXJJBMEGIX7T2OXDAKIA7CCKN4RJV'

describe('the wallets this browser bridged with', () => {
  it('remembers each once, whatever the case of the address, the latest first', () => {
    rememberWallet('testnet', 'evm', EVM_A)
    rememberWallet('testnet', 'stellar', G_A)
    rememberWallet('testnet', 'evm', EVM_A.toLowerCase())
    expect(listWallets('testnet').map((w) => [w.kind, w.address])).toEqual([
      ['stellar', G_A],
      ['evm', EVM_A],
    ])
    expect(listWallets('mainnet')).toEqual([])
  })

  it('keeps the six last ones, forgets one unseen for a month, and ignores what is not an address', () => {
    for (let i = 0; i < 8; i++) rememberWallet('testnet', 'evm', `0x${String(i).repeat(40)}`)
    expect(listWallets('testnet')).toHaveLength(6)
    localStorage.setItem(
      'lob_cctp_wallets_testnet',
      JSON.stringify([
        { kind: 'evm', address: EVM_A, at: Date.now() - 31 * 24 * 3600_000 },
        { kind: 'evm', address: 'not-an-address', at: Date.now() },
        { kind: 'stellar', address: 'GABC', at: Date.now() },
        { kind: 'stellar', address: G_A, at: Date.now() },
      ]),
    )
    expect(listWallets('testnet').map((w) => w.address)).toEqual([G_A])
  })

  it('searches the wallets connected now and the remembered ones, each once', () => {
    rememberWallet('testnet', 'evm', EVM_A)
    rememberWallet('testnet', 'stellar', G_A)
    expect(walletsToSearch('testnet', G_A, EVM_A.toLowerCase())).toEqual({ stellar: [G_A], evm: [EVM_A.toLowerCase()] })
    expect(walletsToSearch('testnet', null, undefined)).toEqual({ stellar: [G_A], evm: [EVM_A] })
  })
})
