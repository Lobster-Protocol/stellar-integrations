import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import { dfnsSigner } from '../dfns-signer'
import { setActiveProfile, DEMO_PROFILE_ID } from '../../dfns/profiles'

const PASSPHRASE = 'Test SDF Network ; September 2015'
const ACCOUNT = 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU'
const ORIG_API = import.meta.env.VITE_LOBSTER_API_URL
const ORIG_TOKEN = import.meta.env.VITE_LOBSTER_API_TOKEN

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchSpy = vi.fn()
  globalThis.fetch = fetchSpy as unknown as typeof fetch
  localStorage.clear()
  Reflect.set(import.meta.env, 'VITE_LOBSTER_API_URL', 'http://localhost:8787')
  Reflect.set(import.meta.env, 'VITE_LOBSTER_API_TOKEN', '')
  // the demo is no longer the default active profile, so the signer path opts in.
  setActiveProfile(DEMO_PROFILE_ID)
})

afterEach(() => {
  Reflect.set(import.meta.env, 'VITE_LOBSTER_API_URL', ORIG_API)
  Reflect.set(import.meta.env, 'VITE_LOBSTER_API_TOKEN', ORIG_TOKEN)
  // a test that switched on fake timers must not leak them into the next one.
  vi.useRealTimers()
})

describe('dfnsSigner.signTransaction', () => {
  it('throws when no dfns profile is selected', async () => {
    Reflect.set(import.meta.env, 'VITE_LOBSTER_API_URL', '')
    await expect(
      dfnsSigner.signTransaction('XDR', { networkPassphrase: PASSPHRASE, address: ACCOUNT }),
    ).rejects.toThrow(/No DFNS profile is selected/)
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

  it('gives up with a clear error when the relay never answers (H1 timeout)', async () => {
    vi.useFakeTimers()
    // a relay that hangs: the fetch stays pending until the signer's own abort
    // signal fires, exactly as a real fetch rejects when the AbortController aborts
    // at the 60s cap. the signer keys on ctrl.signal.aborted, not the reject value.
    fetchSpy.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    )
    const p = dfnsSigner.signTransaction('XDR', { networkPassphrase: PASSPHRASE, address: ACCOUNT })
    const assertion = expect(p).rejects.toThrow(/did not answer the signing request in time/)
    await vi.advanceTimersByTimeAsync(60_000)
    await assertion
  })
})
