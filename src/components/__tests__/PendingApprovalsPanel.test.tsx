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
  localStorage.clear()
})

afterEach(() => {
  Reflect.set(import.meta.env, 'VITE_LOBSTER_API_URL', ORIG_API)
  localStorage.clear()
})

// holding the operator token is what reveals approve and deny
function asOperator() {
  localStorage.setItem('lob_operator_token', 'test-operator-token')
}

const ONE_PENDING = {
  ok: true,
  json: async () => ({ items: [{ id: 'app-1', status: 'Pending', activityKind: 'Wallets:Sign' }] }),
}

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

describe('PendingApprovalsPanel', () => {
  it('names the missing configuration instead of disappearing when the api url is unset', () => {
    Reflect.set(import.meta.env, 'VITE_LOBSTER_API_URL', '')
    wrap(<PendingApprovalsPanel />)
    expect(screen.getByText(/Pending approvals/)).toBeInTheDocument()
    expect(screen.getByText(/VITE_LOBSTER_API_URL is not set/)).toBeInTheDocument()
  })

  it('shows the empty state when no approvals are returned', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) })
    wrap(<PendingApprovalsPanel />)
    await waitFor(() => expect(screen.getByText(/Nothing is waiting for approval/i)).toBeInTheDocument())
  })

  it('renders an approval row read-only, with no decision buttons, by default', async () => {
    fetchSpy.mockResolvedValueOnce(ONE_PENDING)
    wrap(<PendingApprovalsPanel />)
    await waitFor(() => expect(screen.getByText('app-1')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Approve' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Deny' })).not.toBeInTheDocument()
    expect(screen.getByText(/Approve and deny happen in the DFNS console/i)).toBeInTheDocument()
    expect(screen.getByText(/Waiting on the DFNS console/i)).toBeInTheDocument()
  })

  it('renders approve and deny for an operator', async () => {
    asOperator()
    fetchSpy.mockResolvedValueOnce(ONE_PENDING)
    wrap(<PendingApprovalsPanel />)
    await waitFor(() => expect(screen.getByText('app-1')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Approve' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Deny' })).toBeInTheDocument()
  })
})
