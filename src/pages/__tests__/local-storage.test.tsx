import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import Overview from '../Overview'
import Performance from '../Performance'

const { settled } = vi.hoisted(() => ({
  // the part of a finished query the pages read
  settled: (data: unknown) => ({
    data,
    isLoading: false,
    isError: false,
    isFetching: false,
    dataUpdatedAt: 0,
    refetch: () => {},
  }),
}))

vi.mock('../../contexts/WalletContext', () => ({
  useWallet: () => ({ address: 'GOWNER', connect: () => {}, connecting: false }),
}))
vi.mock('../../contexts/NetworkContext', () => ({ useNetwork: () => ({ network: 'testnet' }) }))
vi.mock('../../integrations/horizon/account', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../integrations/horizon/account')>()),
  useAccountBalances: () => settled([{ code: 'XLM', balance: '100.0000000', isNative: true }]),
  useAccountExists: () => 'live',
}))
vi.mock('../../integrations/pricing/price', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../integrations/pricing/price')>()),
  useXlmPrice: () => settled(0.25),
}))
vi.mock('../../integrations/lobster/position', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../integrations/lobster/position')>()),
  useVaultPositions: () => settled([]),
}))
vi.mock('../../integrations/pricing/history', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../integrations/pricing/history')>()),
  useBalanceHistory: () => settled(undefined),
}))
vi.mock('../../integrations/horizon/activity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../integrations/horizon/activity')>()),
  useActivity: () => settled({ pages: [] }),
}))
vi.mock('../../components/BridgeModal', () => ({ default: () => null }))
vi.mock('../../components/SwapModal', () => ({ default: () => null }))

beforeEach(() => localStorage.clear())

describe('Overview', () => {
  it('writes nothing to localStorage', async () => {
    render(
      <MemoryRouter>
        <Overview />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Wallet plus vaults, quoted in testnet USDC.')).toBeInTheDocument()
    expect(Object.keys(localStorage)).toEqual([])
  })
})

describe('Performance', () => {
  it('writes nothing to localStorage', async () => {
    render(
      <MemoryRouter>
        <Performance />
      </MemoryRouter>,
    )
    expect(await screen.findByText('25.00 USDC')).toBeInTheDocument()
    expect(Object.keys(localStorage)).toEqual([])
  })
})
