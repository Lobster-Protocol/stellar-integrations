import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const { ttlState } = vi.hoisted(() => ({ ttlState: { data: undefined as unknown } }))

vi.mock('../../integrations/ttl/hooks', () => ({
  useTtlStatus: () => ({
    data: ttlState.data,
    isError: false,
    isLoading: false,
    isFetching: false,
    error: null,
    dataUpdatedAt: Date.now(),
    refetch: vi.fn(),
  }),
}))

import TtlCountdownCard from '../TtlCountdownCard'
import { NetworkProvider } from '../../contexts/NetworkContext'

const ORIG_API = import.meta.env.VITE_LOBSTER_API_URL

// the three keys the relay watches on mainnet: factory instance, factory code, vault code
const FACTORY_INSTANCE = 'AAAABgAAAAEKaFVFFlE2/omjkJeyizZjSP43N4YMJ1UJkGLY5ymj5gAAABQAAAAB'
const FACTORY_CODE = 'AAAAB80SFCpYBkHvkqmflGSmZ75YUejCIcYyzlD5npZFU6cy'
const VAULT_CODE = 'AAAAB6cqZ6xLn6CtVhAy2NQz1NoAJBAM2yf5CYy4mZckO4OC'

beforeEach(() => {
  localStorage.setItem('lob_network', 'mainnet')
  Reflect.set(import.meta.env, 'VITE_LOBSTER_API_URL', 'http://localhost:8787')
})

afterEach(() => {
  localStorage.clear()
  Reflect.set(import.meta.env, 'VITE_LOBSTER_API_URL', ORIG_API)
})

const row = (key: string, kind?: string) => ({ key, kind, remainingLedgers: 3_070_625, remainingSeconds: 15_353_125, level: 'ok' })

describe('TtlCountdownCard', () => {
  it('names each entry the way the relay does, the vault code apart from the factory code', () => {
    ttlState.data = {
      network: 'mainnet',
      latestLedger: 64_717_078,
      statuses: [row(FACTORY_INSTANCE, 'instance'), row(FACTORY_CODE, 'factory-code'), row(VAULT_CODE, 'vault-code')],
    }
    render(<NetworkProvider><TtlCountdownCard /></NetworkProvider>)
    expect(screen.getByText('Factory instance')).toBeInTheDocument()
    expect(screen.getByText('Factory code')).toBeInTheDocument()
    expect(screen.getByText('Vault code')).toBeInTheDocument()
  })

  it('falls back to a plain name for an entry the relay does not name', () => {
    ttlState.data = { network: 'mainnet', latestLedger: 64_717_078, statuses: [row(FACTORY_INSTANCE)] }
    render(<NetworkProvider><TtlCountdownCard /></NetworkProvider>)
    expect(screen.getByText('Storage entry')).toBeInTheDocument()
  })
})
