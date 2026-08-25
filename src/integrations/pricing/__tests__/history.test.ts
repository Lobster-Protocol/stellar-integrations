import { describe, it, expect } from 'vitest'

import { densify, assetKey, keyCode, valueAtCurrentPrice } from '../history'

const pt = (ts: number, xlm: number) => ({ ts, held: { XLM: xlm } })

describe('densify', () => {
  it('leaves a series alone when there is nothing to fill', () => {
    expect(densify([])).toEqual([])
    expect(densify([pt(0, 1)])).toEqual([pt(0, 1)])
  })

  it('fills the gap between two distant changes', () => {
    const out = densify([pt(0, 100), pt(90 * 86_400_000, 50)], 40)
    expect(out.length).toBeGreaterThan(30)
  })

  it('only ever repeats a value the account actually held', () => {
    const changes = [pt(0, 100), pt(1_000_000, 60), pt(2_000_000, 25)]
    const held = new Set(changes.map((c) => c.held.XLM))
    for (const p of densify(changes, 50)) {
      expect(held.has(p.held.XLM)).toBe(true)
    }
  })

  it('carries the last value forward rather than interpolating', () => {
    const out = densify([pt(0, 100), pt(1_000_000, 0)], 20)
    const mid = out.filter((p) => p.ts > 0 && p.ts < 1_000_000)
    expect(mid.length).toBeGreaterThan(0)
    // an interpolated series would show values between 0 and 100 here
    for (const p of mid) expect(p.held.XLM).toBe(100)
  })

  it('keeps the real change points, at their exact timestamps', () => {
    const changes = [pt(0, 100), pt(333_333, 70), pt(1_000_000, 5)]
    const out = densify(changes, 30)
    for (const c of changes) {
      expect(out.some((p) => p.ts === c.ts && p.held.XLM === c.held.XLM)).toBe(true)
    }
  })

  it('stays in chronological order', () => {
    const out = densify([pt(0, 9), pt(500_000, 4), pt(900_000, 1)], 25)
    for (let i = 1; i < out.length; i++) expect(out[i].ts).toBeGreaterThan(out[i - 1].ts)
  })

  it('ends on the real last point', () => {
    const last = pt(1_000_000, 3)
    const out = densify([pt(0, 10), last], 25)
    expect(out.at(-1)).toEqual(last)
  })
})

describe('asset keys', () => {
  it('keeps the issuer so two tokens sharing a code stay apart', () => {
    expect(assetKey('USDC', 'GISSUER')).toBe('USDC|GISSUER')
    expect(assetKey('USDC', 'GOTHER')).not.toBe(assetKey('USDC', 'GISSUER'))
    expect(assetKey('XLM')).toBe('XLM')
  })

  it('reads the code back out', () => {
    expect(keyCode('USDC|GISSUER')).toBe('USDC')
    expect(keyCode('XLM')).toBe('XLM')
  })
})

describe('valueAtCurrentPrice', () => {
  it('counts only what it has a price for', () => {
    const point = { ts: 0, held: { XLM: 100, 'LOBS|GX': 5000 } }
    expect(valueAtCurrentPrice(point, { XLM: 0.2 })).toBe(20)
  })

  it('a look-alike token under a different issuer gets no price', () => {
    const point = { ts: 0, held: { 'USDC|GFAKE': 1_000_000 } }
    expect(valueAtCurrentPrice(point, { 'USDC|GREAL': 1 })).toBe(0)
  })
})
