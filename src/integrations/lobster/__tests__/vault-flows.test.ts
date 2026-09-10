import { describe, it, expect } from 'vitest'

import { movesFromEvents, vaultFlowSeries, type VaultMove } from '../vault-flows'
import type { ActivityEvent, AssetMove } from '../../horizon/activity'

const VAULT = 'CVAULT1'
const OTHER = 'CVAULT2'

// a move carries signed stroops; the fixtures below read in whole tokens
const units = (n: number) => BigInt(n) * 10_000_000n

function move(over: Partial<AssetMove> = {}): AssetMove {
  return { code: 'XLM', amount: '100', direction: 'out', counterparty: VAULT, ...over }
}

function event(at: string, moves: AssetMove[], over: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: at,
    kind: 'liquidity-add',
    at,
    txHash: `tx-${at}`,
    ok: true,
    moves,
    ...over,
  }
}

describe('movesFromEvents', () => {
  it('reads a transfer to a contract as value going into it', () => {
    const [m] = movesFromEvents([event('2026-07-04T09:00:00Z', [move()])])
    expect(m.vault).toBe(VAULT)
    expect(m.amount).toBe(units(100))
    expect(m.code).toBe('XLM')
  })

  it('signs what comes back out of the vault negative', () => {
    const [m] = movesFromEvents([
      event('2026-08-01T09:00:00Z', [move({ direction: 'in', amount: '40' })]),
    ])
    expect(m.amount).toBe(units(-40))
  })

  it('leaves out a counterparty that is an account rather than a contract', () => {
    expect(
      movesFromEvents([event('2026-07-04T09:00:00Z', [move({ counterparty: 'GSOMEONE' })])]),
    ).toHaveLength(0)
  })

  it('leaves out a counterparty the ledger did not name', () => {
    expect(
      movesFromEvents([event('2026-07-04T09:00:00Z', [move({ counterparty: undefined })])]),
    ).toHaveLength(0)
  })

  it('drops the zero leg a two-token call declares and never touches', () => {
    // a deposit of 100 XLM and no LOBS still writes both lines on the ledger
    const moves = movesFromEvents([
      event('2026-07-04T09:00:00Z', [move(), move({ code: 'LOBS', amount: '0.0000000' })]),
    ])
    expect(moves).toHaveLength(1)
    expect(moves[0].code).toBe('XLM')
  })

  it('skips an amount it cannot read exactly rather than rounding it into a total', () => {
    expect(movesFromEvents([event('2026-07-04T09:00:00Z', [move({ amount: '1e7' })])])).toHaveLength(
      0,
    )
  })

  it('ignores a transaction that failed, since nothing moved', () => {
    expect(movesFromEvents([event('2026-07-04T09:00:00Z', [move()], { ok: false })])).toHaveLength(0)
  })

  it('puts the oldest move first whatever order Horizon returned', () => {
    const moves = movesFromEvents([
      event('2026-08-27T09:00:00Z', [move()]),
      event('2026-07-04T09:00:00Z', [move()]),
    ])
    expect(moves.map((m) => m.ts)).toEqual([
      Date.parse('2026-07-04T09:00:00Z'),
      Date.parse('2026-08-27T09:00:00Z'),
    ])
  })
})

describe('vaultFlowSeries', () => {
  const at = (iso: string) => Date.parse(iso)

  const moves: VaultMove[] = [
    { ts: at('2026-07-04T09:00:00Z'), vault: VAULT, code: 'XLM', amount: units(500) },
    { ts: at('2026-07-04T09:00:00Z'), vault: VAULT, code: 'LOBS', amount: units(1000) },
    { ts: at('2026-08-27T14:00:00Z'), vault: VAULT, code: 'XLM', amount: units(-500) },
    { ts: at('2026-08-27T15:00:00Z'), vault: VAULT, code: 'XLM', amount: units(100) },
    { ts: at('2026-09-02T15:00:00Z'), vault: OTHER, code: 'XLM', amount: units(7) },
  ]

  it('says nothing rather than drawing a flat line for a vault with no moves', () => {
    expect(vaultFlowSeries(moves, 'CNOTHING')).toBeNull()
  })

  it('only counts what moved with the vault asked for', () => {
    expect(vaultFlowSeries(moves, OTHER)!.count).toBe(1)
  })

  it('keeps a running total per token, to the stroop', () => {
    const s = vaultFlowSeries(moves, VAULT)!
    expect(s.net).toEqual({ XLM: '100.0000000', LOBS: '1000.0000000' })
    expect(s.count).toBe(4)
  })

  it('records one point per moment, not one per token line', () => {
    const s = vaultFlowSeries(moves, VAULT)!
    expect(s.points.map((p) => p.ts)).toEqual([
      at('2026-07-04T09:00:00Z'),
      at('2026-08-27T14:00:00Z'),
      at('2026-08-27T15:00:00Z'),
    ])
  })

  it('carries a token forward at a moment it did not move', () => {
    const s = vaultFlowSeries(moves, VAULT)!
    // LOBS was untouched on 27 August and still stood at what went in in July
    expect(s.points[1].net.LOBS).toBe(1000)
    expect(s.points[1].net.XLM).toBe(0)
  })

  it('reports what went in and what came back as separate totals', () => {
    const s = vaultFlowSeries(moves, VAULT)!
    expect(s.putIn).toEqual({ XLM: '600.0000000', LOBS: '1000.0000000' })
    expect(s.takenBack).toEqual({ XLM: '500.0000000', LOBS: '0.0000000' })
  })

  const lopsided: VaultMove[] = [
    { ts: at('2026-07-04T09:00:00Z'), vault: VAULT, code: 'XLM', amount: units(1) },
    { ts: at('2026-08-27T09:00:00Z'), vault: VAULT, code: 'LOBS', amount: units(900) },
  ]

  it('puts the busiest token first when nothing says otherwise', () => {
    expect(vaultFlowSeries(lopsided, VAULT)!.codes).toEqual(['LOBS', 'XLM'])
  })

  it('follows the vault pair instead, so the panels read like the rest of the card', () => {
    expect(vaultFlowSeries(lopsided, VAULT, ['XLM', 'LOBS'])!.codes).toEqual(['XLM', 'LOBS'])
  })

  it('drops a token it could not name and still orders the one it could', () => {
    expect(vaultFlowSeries(lopsided, VAULT, [null, 'LOBS'])!.codes).toEqual(['LOBS', 'XLM'])
  })

  it('leaves a code that is neither of the pair behind both', () => {
    const stray = [
      ...lopsided,
      { ts: at('2026-09-01T09:00:00Z'), vault: VAULT, code: 'EURC', amount: units(5000) },
    ]
    expect(vaultFlowSeries(stray, VAULT, ['XLM', 'LOBS'])!.codes).toEqual(['XLM', 'LOBS', 'EURC'])
  })

  it('handles a vault touched exactly once', () => {
    const one = vaultFlowSeries(
      [{ ts: at('2026-07-04T09:00:00Z'), vault: VAULT, code: 'XLM', amount: units(12) }],
      VAULT,
    )!
    expect(one.points).toHaveLength(1)
    expect(one.net.XLM).toBe('12.0000000')
  })

  it('shows a vault that gave back more than this wallet put in as negative', () => {
    const out = vaultFlowSeries(
      [
        { ts: at('2026-07-04T09:00:00Z'), vault: VAULT, code: 'LOBS', amount: units(50) },
        { ts: at('2026-08-27T09:00:00Z'), vault: VAULT, code: 'LOBS', amount: units(-1000) },
      ],
      VAULT,
    )!
    expect(out.net.LOBS).toBe('-950.0000000')
    expect(out.points[1].net.LOBS).toBe(-950)
  })

  it('adds a long trail of fractions without drifting off the ledger figure', () => {
    // 0.1 + 0.2 in floating point is famously not 0.3, and a vault trail is a
    // hundred of those in a row
    const dust = Array.from({ length: 100 }, (_, i) => ({
      ts: at('2026-07-04T09:00:00Z') + i,
      vault: VAULT,
      code: 'XLM',
      amount: 1_000_000n,
    }))
    expect(vaultFlowSeries(dust, VAULT)!.net.XLM).toBe('10.0000000')
  })
})
