import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { dfnsSigner } from '../dfns-signer'

const PASSPHRASE = 'Test SDF Network ; September 2015'
const ACCOUNT = 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU'
const ORIG_API = import.meta.env.VITE_LOBSTER_API_URL
const ORIG_TOKEN = import.meta.env.VITE_LOBSTER_API_TOKEN

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchSpy = vi.fn()
  globalThis.fetch = fetchSpy as unknown as typeof fetch
  Reflect.set(import.meta.env, 'VITE_LOBSTER_API_URL', 'http://localhost:8787')
  Reflect.set(import.meta.env, 'VITE_LOBSTER_API_TOKEN', '')
})

afterEach(() => {
  Reflect.set(import.meta.env, 'VITE_LOBSTER_API_URL', ORIG_API)
  Reflect.set(import.meta.env, 'VITE_LOBSTER_API_TOKEN', ORIG_TOKEN)
})

describe('dfnsSigner.signTransaction', () => {
  it('throws when VITE_LOBSTER_API_URL is unset', async () => {
    Reflect.set(import.meta.env, 'VITE_LOBSTER_API_URL', '')
    await expect(
      dfnsSigner.signTransaction('XDR', { networkPassphrase: PASSPHRASE, address: ACCOUNT }),
    ).rejects.toThrow(/VITE_LOBSTER_API_URL/)
  })

  it('posts to /dfns/sign and returns the signed envelope', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ signedTxXdr: 'SIGNED' }),
    })
    const r = await dfnsSigner.signTransaction('RAW_XDR', {
      networkPassphrase: PASSPHRASE,
      address: ACCOUNT,
    })
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:8787/dfns/sign',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
      }),
    )
    expect(r.signedTxXdr).toBe('SIGNED')
  })

  it('attaches the x-lobster-token header when configured', async () => {
    Reflect.set(import.meta.env, 'VITE_LOBSTER_API_TOKEN', 'token-32-chars-long-and-strong')
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ signedTxXdr: 'SIGNED' }),
    })
    await dfnsSigner.signTransaction('XDR', { networkPassphrase: PASSPHRASE, address: ACCOUNT })
    const call = fetchSpy.mock.calls[0][1] as RequestInit
    expect((call.headers as Record<string, string>)['x-lobster-token']).toBe('token-32-chars-long-and-strong')
  })

  it('omits the token header when VITE_LOBSTER_API_TOKEN is empty', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ signedTxXdr: 'SIGNED' }),
    })
    await dfnsSigner.signTransaction('XDR', { networkPassphrase: PASSPHRASE, address: ACCOUNT })
    const call = fetchSpy.mock.calls[0][1] as RequestInit
    expect((call.headers as Record<string, string>)['x-lobster-token']).toBeUndefined()
  })

  it('throws when the response is not ok', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 502,
      text: async () => 'dfns down',
    })
    await expect(
      dfnsSigner.signTransaction('XDR', { networkPassphrase: PASSPHRASE, address: ACCOUNT }),
    ).rejects.toThrow(/502/)
  })

  it('throws when the response is ok but signedTxXdr is missing', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ error: 'policy rejected' }),
    })
    await expect(
      dfnsSigner.signTransaction('XDR', { networkPassphrase: PASSPHRASE, address: ACCOUNT }),
    ).rejects.toThrow(/policy rejected/)
  })
})
