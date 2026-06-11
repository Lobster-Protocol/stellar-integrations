import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

import { useDfnsSignatureStream } from '../useDfnsSignatureStream'

const ORIG_API = import.meta.env.VITE_LOBSTER_API_URL
const ORIG_TOKEN = import.meta.env.VITE_LOBSTER_API_TOKEN

class MockEventSource {
  url: string
  withCredentials: boolean
  listeners: Map<string, (e: MessageEvent) => void> = new Map()
  closed = false

  constructor(url: string, init?: { withCredentials?: boolean }) {
    this.url = url
    this.withCredentials = init?.withCredentials ?? false
    MockEventSource.lastInstance = this
  }

  addEventListener(kind: string, fn: (e: MessageEvent) => void) {
    this.listeners.set(kind, fn)
  }
  removeEventListener(kind: string) {
    this.listeners.delete(kind)
  }
  close() {
    this.closed = true
  }
  emit(kind: string, data: unknown) {
    const fn = this.listeners.get(kind)
    fn?.(new MessageEvent(kind, { data: typeof data === 'string' ? data : JSON.stringify(data) }))
  }

  static lastInstance: MockEventSource | null = null
}

beforeEach(() => {
  MockEventSource.lastInstance = null
  vi.stubGlobal('EventSource', MockEventSource)
  Reflect.set(import.meta.env, 'VITE_LOBSTER_API_URL', 'http://localhost:8787')
  Reflect.set(import.meta.env, 'VITE_LOBSTER_API_TOKEN', '')
})

afterEach(() => {
  vi.unstubAllGlobals()
  Reflect.set(import.meta.env, 'VITE_LOBSTER_API_URL', ORIG_API)
  Reflect.set(import.meta.env, 'VITE_LOBSTER_API_TOKEN', ORIG_TOKEN)
})

describe('useDfnsSignatureStream', () => {
  it('does nothing when VITE_LOBSTER_API_URL is unset', () => {
    Reflect.set(import.meta.env, 'VITE_LOBSTER_API_URL', '')
    const { result } = renderHook(() => useDfnsSignatureStream())
    expect(result.current).toEqual([])
    expect(MockEventSource.lastInstance).toBeNull()
  })

  it('opens an EventSource against /sse with credentials', () => {
    renderHook(() => useDfnsSignatureStream())
    const es = MockEventSource.lastInstance
    expect(es).not.toBeNull()
    expect(es!.url).toBe('http://localhost:8787/sse')
    expect(es!.withCredentials).toBe(true)
  })

  it('appends the api token as a ?token= query when configured', () => {
    Reflect.set(import.meta.env, 'VITE_LOBSTER_API_TOKEN', 'token-32-chars')
    renderHook(() => useDfnsSignatureStream())
    const es = MockEventSource.lastInstance
    expect(es!.url).toContain('?token=token-32-chars')
  })

  it('subscribes to every D4-relevant event kind', () => {
    renderHook(() => useDfnsSignatureStream())
    const es = MockEventSource.lastInstance!
    for (const kind of [
      'wallet.signature.requested',
      'wallet.signature.signed',
      'wallet.signature.failed',
      'wallet.transaction.broadcasted',
      'wallet.transaction.confirmed',
      'wallet.transfer.confirmed',
      'policy.approval.pending',
      'policy.approval.resolved',
    ]) {
      expect(es.listeners.has(kind)).toBe(true)
    }
  })

  it('accumulates events newest-first and caps at MAX_EVENTS', () => {
    const { result } = renderHook(() => useDfnsSignatureStream())
    const es = MockEventSource.lastInstance!
    act(() => {
      es.emit('wallet.signature.signed', { id: 'a', kind: 'wallet.signature.signed', timestampSent: 1 })
      es.emit('wallet.signature.signed', { id: 'b', kind: 'wallet.signature.signed', timestampSent: 2 })
    })
    expect(result.current.map((e) => e.id)).toEqual(['b', 'a'])
  })

  it('drops malformed json frames silently', () => {
    const { result } = renderHook(() => useDfnsSignatureStream())
    const es = MockEventSource.lastInstance!
    act(() => {
      es.emit('wallet.signature.signed', 'this is not json')
    })
    expect(result.current).toEqual([])
  })

  it('closes the EventSource on unmount', () => {
    const { unmount } = renderHook(() => useDfnsSignatureStream())
    const es = MockEventSource.lastInstance!
    expect(es.closed).toBe(false)
    unmount()
    expect(es.closed).toBe(true)
  })
})
