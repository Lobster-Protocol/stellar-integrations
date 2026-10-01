import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import SignDemoTx from '../SignDemoTx'
import { setActiveProfile, DEMO_PROFILE_ID } from '../../integrations/dfns/profiles'

const { signTransaction, buildPingTx, submitSignedXdr, waitForTx } = vi.hoisted(() => ({
  signTransaction: vi.fn(),
  buildPingTx: vi.fn(),
  submitSignedXdr: vi.fn(),
  waitForTx: vi.fn(),
}))

vi.mock('../../contexts/WalletContext', () => ({
  useWallet: () => ({ address: null, walletName: null, walletId: null }),
}))
vi.mock('../../contexts/NetworkContext', () => ({ useNetwork: () => ({ network: 'testnet' }) }))
vi.mock('../../contexts/CustodyContext', () => ({
  useCustody: () => ({ signer: { name: 'dfns', signTransaction }, dfnsAddress: 'GTREASURY', setMode: vi.fn() }),
}))
vi.mock('../../integrations/lobster/factory', () => ({
  buildPingTx: (...a: unknown[]) => buildPingTx(...a),
  submitSignedXdr: (...a: unknown[]) => submitSignedXdr(...a),
  waitForTx: (...a: unknown[]) => waitForTx(...a),
}))

const ORIG_API = import.meta.env.VITE_LOBSTER_API_URL

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  signTransaction.mockReset()
  buildPingTx.mockReset()
  submitSignedXdr.mockReset()
  waitForTx.mockReset()
  fetchSpy = vi.fn()
  globalThis.fetch = fetchSpy as unknown as typeof fetch
  Reflect.set(import.meta.env, 'VITE_LOBSTER_API_URL', 'http://localhost:8787')
  localStorage.clear()
  // the approval poll goes to the active relay, so select the demo one.
  setActiveProfile(DEMO_PROFILE_ID)
})

afterEach(() => {
  Reflect.set(import.meta.env, 'VITE_LOBSTER_API_URL', ORIG_API)
  localStorage.clear()
})

function wrap(node: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{node}</QueryClientProvider>)
}

describe('SignDemoTx', () => {
  it('submits a held factory call once dfns signs it', async () => {
    buildPingTx.mockResolvedValueOnce({ xdr: 'PING_XDR' })
    signTransaction.mockResolvedValueOnce({ pendingId: 'sig-1' })
    // dfns never broadcasts a soroban call, so an approved one stops at Signed
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ status: 'Signed', signedTxXdr: 'ENV_XDR' }),
    })
    submitSignedXdr.mockResolvedValueOnce('SUBMITTED_HASH')
    waitForTx.mockResolvedValueOnce({ status: 'SUCCESS' })

    wrap(<SignDemoTx />)
    fireEvent.click(screen.getByRole('button', { name: 'Call the Factory (DFNS MPC)' }))

    expect(await screen.findByText('Confirmed on testnet')).toBeInTheDocument()
    expect(fetchSpy.mock.calls[0][0]).toBe('http://localhost:8787/dfns/sign/sig-1/status')
    expect(submitSignedXdr).toHaveBeenCalledWith('testnet', 'ENV_XDR')
    expect(screen.getByText('SUBMITTED_HASH')).toBeInTheDocument()
  })
})
