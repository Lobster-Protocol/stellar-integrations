import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'

import {
  useDfnsPolicies,
  useDfnsWallets,
  useDfnsPendingApprovals,
  useCreateDfnsWallet,
  RelayError,
} from '../hooks'

const ORIG_API = import.meta.env.VITE_LOBSTER_API_URL
const ORIG_TOKEN = import.meta.env.VITE_LOBSTER_API_TOKEN

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchSpy = vi.fn()
  globalThis.fetch = fetchSpy as unknown as typeof fetch
  Reflect.set(import.meta.env, 'VITE_LOBSTER_API_URL', 'http://localhost:8787')
  Reflect.set(import.meta.env, 'VITE_LOBSTER_API_TOKEN', '')
  localStorage.clear()
})

afterEach(() => {
  Reflect.set(import.meta.env, 'VITE_LOBSTER_API_URL', ORIG_API)
  Reflect.set(import.meta.env, 'VITE_LOBSTER_API_TOKEN', ORIG_TOKEN)
})

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children)
}

describe('useDfnsPolicies', () => {
  it('sends the x-lobster-token header when configured', async () => {
    Reflect.set(import.meta.env, 'VITE_LOBSTER_API_TOKEN', 'token-32-chars')
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) })
    const { result } = renderHook(() => useDfnsPolicies(), { wrapper: wrap() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const call = fetchSpy.mock.calls[0][1] as RequestInit
    expect((call.headers as Record<string, string>)['x-lobster-token']).toBe('token-32-chars')
    expect(call.credentials).toBe('include')
  })

  it('omits the token header when the env is empty', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) })
    const { result } = renderHook(() => useDfnsPolicies(), { wrapper: wrap() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const call = fetchSpy.mock.calls[0][1] as RequestInit
    expect((call.headers as Record<string, string>)['x-lobster-token']).toBeUndefined()
  })

  it('does not fire when VITE_LOBSTER_API_URL is unset', async () => {
    Reflect.set(import.meta.env, 'VITE_LOBSTER_API_URL', '')
    renderHook(() => useDfnsPolicies(), { wrapper: wrap() })
    await new Promise((r) => setTimeout(r, 30))
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('useDfnsWallets', () => {
  it('hits /dfns/wallets', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) })
    const { result } = renderHook(() => useDfnsWallets(), { wrapper: wrap() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(fetchSpy.mock.calls[0][0]).toBe('http://localhost:8787/dfns/wallets')
  })
})

describe('relay failures', () => {
  it('keeps the status so a 401 can be told apart from an unreachable relay', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
    const { result } = renderHook(() => useDfnsWallets(), { wrapper: wrap() })
    await waitFor(() => expect(result.current.isError).toBe(true))
    const err = result.current.error as RelayError
    expect(err).toBeInstanceOf(RelayError)
    expect(err.status).toBe(401)
    expect(err.message).toMatch(/no valid API token/i)
  })
})

describe('useCreateDfnsWallet', () => {
  it('sends no operator header when this browser holds no operator token', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    const { result } = renderHook(() => useCreateDfnsWallet(), { wrapper: wrap() })
    result.current.mutate({ name: 'w', network: 'StellarTestnet' })
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    const call = fetchSpy.mock.calls[0][1] as RequestInit
    expect((call.headers as Record<string, string>)['x-lobster-operator-token']).toBeUndefined()
  })

  it('sends the operator header when the token is stored', async () => {
    localStorage.setItem('lob_operator_token', 'operator-token-value')
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({}) })
    const { result } = renderHook(() => useCreateDfnsWallet(), { wrapper: wrap() })
    result.current.mutate({ name: 'w', network: 'StellarTestnet' })
    await waitFor(() => expect(fetchSpy).toHaveBeenCalled())
    const call = fetchSpy.mock.calls[0][1] as RequestInit
    expect((call.headers as Record<string, string>)['x-lobster-operator-token']).toBe(
      'operator-token-value',
    )
  })
})

describe('useDfnsPendingApprovals', () => {
  it('polls and includes credentials', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) })
    const { result } = renderHook(() => useDfnsPendingApprovals(), { wrapper: wrap() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const call = fetchSpy.mock.calls[0][1] as RequestInit
    expect(call.credentials).toBe('include')
  })
})
