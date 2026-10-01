import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { NotFoundError } from '@stellar/stellar-sdk'

const loadAccount = vi.fn()

vi.mock('../../horizon/client', () => ({
  getHorizonServer: () => ({ loadAccount }),
}))
// an account without classic USDC is also read through the SAC, over Soroban RPC
vi.mock('../token-balance', () => ({ getSorobanTokenBalance: vi.fn(async () => null) }))

const { useTrustline } = await import('../trustline')

const ACCOUNT = 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU'
const USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'

function render() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children)
  return renderHook(() => useTrustline(ACCOUNT, 'USDC', USDC_ISSUER, 'mainnet'), { wrapper })
}

// braces: a function returned from beforeEach is run as its teardown
beforeEach(() => {
  loadAccount.mockReset()
})

describe('useTrustline', () => {
  it('stays pending while Horizon has not said whether the account exists', async () => {
    loadAccount.mockReturnValue(new Promise(() => {}))
    const { result } = render()
    await waitFor(() => expect(loadAccount).toHaveBeenCalled())
    expect(result.current.isPending).toBe(true)
    expect(result.current.data).toBeUndefined()
  })

  it('ends in an error when Horizon cannot be read, never in "no trustline"', async () => {
    loadAccount.mockRejectedValue(new Error('Horizon is down'))
    const { result } = render()
    // the balance read and the trustline read each retry once before giving up
    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 8_000 })
    expect(result.current.data).toBeUndefined()
    expect(loadAccount).toHaveBeenCalledTimes(4)
  })

  it('reads an account that is not on the ledger as no trustline, without asking again', async () => {
    loadAccount.mockRejectedValue(new NotFoundError('Not Found', {}))
    const { result } = render()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe(false)
    expect(loadAccount).toHaveBeenCalledTimes(1)
  })

  it('finds the USDC line of a live account', async () => {
    loadAccount.mockResolvedValue({
      balances: [
        { asset_type: 'native', balance: '12.5' },
        { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: USDC_ISSUER, balance: '3' },
      ],
    })
    const { result } = render()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe(true)
  })

  it('reports no trustline on a live account without the USDC line', async () => {
    loadAccount.mockResolvedValue({ balances: [{ asset_type: 'native', balance: '12.5' }] })
    const { result } = render()
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toBe(false)
  })
})
