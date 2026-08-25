import { describe, it, expect } from 'vitest'

import { activityRows, ACTIVITY_COLUMNS } from '../export'
import type { ActivityEvent } from '../activity'

const col = (name: string) => ACTIVITY_COLUMNS.indexOf(name)
const AMOUNT = col('Amount')
const ASSET = col('Asset')
const DIRECTION = col('Direction')
const COUNTERPARTY = col('Counterparty')
const TYPE = col('Type')
const TX = col('Transaction')

function event(over: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: '1000-1',
    kind: 'sent',
    at: '2026-08-20T10:30:00Z',
    txHash: 'f00d',
    ok: true,
    moves: [],
    ...over,
  }
}

describe('activityRows', () => {
  it('gives every row the same width as the header', () => {
    const rows = activityRows(
      [
        event({ kind: 'storage-rent' }),
        event({
          kind: 'swap',
          moves: [
            { code: 'XLM', amount: '10', direction: 'out' },
            { code: 'USDC', amount: '2', direction: 'in' },
          ],
        }),
      ],
      'testnet',
    )
    for (const r of rows) expect(r).toHaveLength(ACTIVITY_COLUMNS.length)
  })

  it('signs the amount so a spreadsheet can total the column', () => {
    const rows = activityRows(
      [
        event({
          moves: [
            { code: 'XLM', amount: '10.5', direction: 'out' },
            { code: 'XLM', amount: '4', direction: 'in' },
          ],
        }),
      ],
      'testnet',
    )
    expect(rows.map((r) => r[AMOUNT])).toEqual(['-10.5', '4'])
    expect(rows.map((r) => r[DIRECTION])).toEqual(['sent', 'received'])
  })

  it('keeps an operation that moved nothing, on one row', () => {
    const rows = activityRows([event({ kind: 'trustline' })], 'testnet')
    expect(rows).toHaveLength(1)
    expect(rows[0][ASSET]).toBe('')
    expect(rows[0][AMOUNT]).toBe('')
    expect(rows[0][TYPE]).toBe('Trustline')
  })

  it('carries the other side of a transfer', () => {
    const rows = activityRows(
      [
        event({
          kind: 'received',
          moves: [{ code: 'XLM', amount: '3', direction: 'in', counterparty: 'GPAYER' }],
        }),
      ],
      'testnet',
    )
    expect(rows[0][COUNTERPARTY]).toBe('GPAYER')
  })

  it('splits a two-legged operation into rows that share its transaction', () => {
    const rows = activityRows(
      [
        event({
          kind: 'liquidity-add',
          moves: [
            { code: 'XLM', amount: '500', direction: 'out' },
            { code: 'LOBS', amount: '1000', direction: 'out' },
          ],
        }),
      ],
      'testnet',
    )
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((r) => r[TX]))).toEqual(new Set(['f00d']))
  })
})
