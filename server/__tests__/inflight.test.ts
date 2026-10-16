// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'

import { unresolvedSignature, trackPending, clearPending, peekPending } from '../dfns/inflight'

const isTerminal = (s: { status: string }) => s.status === 'Confirmed' || s.status === 'Failed' || s.status === 'Rejected'
const W = 'wa-test-treasury'

beforeEach(() => clearPending(W))

describe('single-in-flight treasury signatures', () => {
  it('nothing tracked, not busy', async () => {
    const busy = await unresolvedSignature(W, async () => ({ status: 'Confirmed' }), isTerminal)
    expect(busy).toBeNull()
  })

  it('a tracked signature still pending blocks the next one', async () => {
    trackPending(W, 'sig-1')
    const busy = await unresolvedSignature(W, async () => ({ status: 'Pending' }), isTerminal)
    expect(busy).toEqual({ id: 'sig-1', status: 'Pending' })
  })

  it('a tracked signature that has gone terminal self-heals and frees the wallet', async () => {
    trackPending(W, 'sig-1')
    expect(await unresolvedSignature(W, async () => ({ status: 'Confirmed' }), isTerminal)).toBeNull()
    // the tracker is cleared, so a later pending check does not resurrect it
    expect(await unresolvedSignature(W, async () => ({ status: 'Pending' }), isTerminal)).toBeNull()
  })

  it('clearPending releases a still-pending tracker', async () => {
    trackPending(W, 'sig-1')
    clearPending(W)
    expect(await unresolvedSignature(W, async () => ({ status: 'Pending' }), isTerminal)).toBeNull()
  })

  it('tracks per wallet independently', async () => {
    trackPending(W, 'sig-1')
    const other = 'wa-other'
    clearPending(other)
    expect(await unresolvedSignature(other, async () => ({ status: 'Pending' }), isTerminal)).toBeNull()
    expect(await unresolvedSignature(W, async () => ({ status: 'Pending' }), isTerminal)).toEqual({ id: 'sig-1', status: 'Pending' })
  })

  it('lets the caller decide what releases, from the whole status', async () => {
    trackPending(W, 'sig-1')
    const signed = async () => ({ status: 'Signed', signedData: '0xab' })
    expect(await unresolvedSignature(W, signed, () => false)).toEqual({ id: 'sig-1', status: 'Signed' })
    expect(await unresolvedSignature(W, signed, (s) => s.signedData === '0xab')).toBeNull()
    expect(peekPending(W)).toBeNull()
  })

  it('peekPending exposes the tracked id so a status read can match before clearing', () => {
    expect(peekPending(W)).toBeNull()
    trackPending(W, 'sig-1')
    expect(peekPending(W)).toBe('sig-1')
    // a status read of a different, already terminal id must not match, so the route
    // that gates clearPending on this equality leaves a still-held signature locked
    expect('sig-OTHER' === peekPending(W)).toBe(false)
    clearPending(W)
    expect(peekPending(W)).toBeNull()
  })
})
