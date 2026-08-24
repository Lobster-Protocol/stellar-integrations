// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'

import { unresolvedSignature, trackPending, clearPending } from '../dfns/inflight'

const isTerminal = (s: string) => s === 'Confirmed' || s === 'Failed' || s === 'Rejected'
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
    expect(busy).toBe('sig-1')
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
    expect(await unresolvedSignature(W, async () => ({ status: 'Pending' }), isTerminal)).toBe('sig-1')
  })
})
