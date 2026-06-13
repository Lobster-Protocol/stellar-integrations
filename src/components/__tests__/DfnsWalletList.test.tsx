import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

import DfnsWalletList from '../DfnsWalletList'
import { NetworkProvider } from '../../contexts/NetworkContext'

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
  return render(
    <MemoryRouter>
      <QueryClientProvider client={qc}>
        <NetworkProvider>{node}</NetworkProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('DfnsWalletList', () => {
  it('returns null when VITE_LOBSTER_API_URL is unset', () => {
    Reflect.set(import.meta.env, 'VITE_LOBSTER_API_URL', '')
    const { container } = wrap(<DfnsWalletList />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the empty state with the New wallet button when no wallets exist', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) })
    wrap(<DfnsWalletList />)
    await waitFor(() => expect(screen.getByText(/No wallets yet/i)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'New wallet' })).toBeInTheDocument()
  })

  it('renders a wallet row with a friendbot button for testnet wallets', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'w-1',
            address: 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU',
            name: 'lobster-testnet-1',
            network: 'StellarTestnet',
          },
        ],
      }),
    })
    wrap(<DfnsWalletList />)
    await waitFor(() => expect(screen.getByText('lobster-testnet-1')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'friendbot' })).toBeInTheDocument()
  })

  it('does not show the friendbot button for mainnet wallets', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        items: [
          {
            id: 'w-2',
            address: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
            name: 'lobster-mainnet',
            network: 'Stellar',
          },
        ],
      }),
    })
    wrap(<DfnsWalletList />)
    await waitFor(() => expect(screen.getByText('lobster-mainnet')).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'friendbot' })).not.toBeInTheDocument()
  })
})
