import { describe, it, expect } from 'vitest'

import { matchesQuery, groupOf, type ActivityEvent } from '../activity'

function event(over: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: '1000-1',
    kind: 'swap',
    at: '2026-08-20T10:30:00Z',
    txHash: '2e0163ba9c',
    ok: true,
    moves: [],
    ...over,
  }
}

describe('matchesQuery', () => {
  const swap = event({
    fn: 'swap_exact_tokens_for_tokens',
    contractId: 'CSOROSWAP',
    swapPath: ['CXLM', 'CUSDC'],
    moves: [{ code: 'USDC', amount: '225.5', direction: 'in', counterparty: 'GPOOL' }],
  })

  it('keeps everything when nothing was typed', () => {
    expect(matchesQuery(swap, '')).toBe(true)
    expect(matchesQuery(swap, '   ')).toBe(true)
  })

  it('finds a row by the label the reader sees', () => {
    expect(matchesQuery(swap, 'swap')).toBe(true)
    expect(matchesQuery(swap, 'SWAP')).toBe(true)
  })

  it('finds a row by asset, amount, counterparty or hash', () => {
    expect(matchesQuery(swap, 'usdc')).toBe(true)
    expect(matchesQuery(swap, '225.5')).toBe(true)
    expect(matchesQuery(swap, 'GPOOL')).toBe(true)
    expect(matchesQuery(swap, '2e0163')).toBe(true)
  })

  it('says no when nothing on the row holds the text', () => {
    expect(matchesQuery(swap, 'phoenix')).toBe(false)
  })

  it('does not match a row on a field it has no value for', () => {
    expect(matchesQuery(event({ kind: 'trustline' }), 'usdc')).toBe(false)
  })
})

describe('groupOf', () => {
  it('sorts each kind into the tab that offers it', () => {
    expect(groupOf('swap')).toBe('trading')
    expect(groupOf('sent')).toBe('moves')
    expect(groupOf('liquidity-add')).toBe('liquidity')
    expect(groupOf('storage-rent')).toBe('housekeeping')
  })
})
