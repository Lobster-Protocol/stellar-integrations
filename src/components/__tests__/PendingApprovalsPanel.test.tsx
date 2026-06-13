import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { vi } from 'vitest'

import PendingApprovalsPanel from '../PendingApprovalsPanel'

const ORIG_API = import.meta.env.VITE_LOBSTER_API_URL

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchSpy = vi.fn()
  globalThis.fetch = fetchSpy as unknown as typeof fetch
  Reflect.set(import.meta.env, 'VITE_LOBSTER_API_URL', 'http://localhost:8787')
})

afterEach(() => {
  Reflect.set(import.meta.env, 'VITE_LOBSTER_API_URL', ORIG_API)
})

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

describe('PendingApprovalsPanel', () => {
  it('returns null when VITE_LOBSTER_API_URL is unset', () => {
    Reflect.set(import.meta.env, 'VITE_LOBSTER_API_URL', '')
    const { container } = wrap(<PendingApprovalsPanel />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the empty state when no approvals are returned', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) })
    wrap(<PendingApprovalsPanel />)
    await waitFor(() => expect(screen.getByText(/No approvals waiting/i)).toBeInTheDocument())
  })

  it('renders an approval row with approve and deny buttons', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [{ id: 'app-1', status: 'Pending', activityKind: 'Wallets:Sign' }],
      }),
    })
    wrap(<PendingApprovalsPanel />)
    await waitFor(() => expect(screen.getByText('app-1')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Deny' })).toBeInTheDocument()
  })
})
