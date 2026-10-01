import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import MicaExportButton from '../MicaExportButton'
import { setActiveProfile, DEMO_PROFILE_ID } from '../../integrations/dfns/profiles'

const ORIG_API = import.meta.env.VITE_LOBSTER_API_URL
const ORIG_CREATE_URL = URL.createObjectURL
const ORIG_REVOKE_URL = URL.revokeObjectURL

const EXPORT = JSON.stringify({ records: [{ transactionReference: 'tx-1' }] })

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchSpy = vi.fn()
  globalThis.fetch = fetchSpy as unknown as typeof fetch
  Reflect.set(import.meta.env, 'VITE_LOBSTER_API_URL', 'http://localhost:8787')
  localStorage.clear()
  setActiveProfile(DEMO_PROFILE_ID)
})

afterEach(() => {
  Reflect.set(import.meta.env, 'VITE_LOBSTER_API_URL', ORIG_API)
  URL.createObjectURL = ORIG_CREATE_URL
  URL.revokeObjectURL = ORIG_REVOKE_URL
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('MicaExportButton', () => {
  it('downloads the export and revokes the url after the click task', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: true, text: async () => EXPORT })
    const createUrl = vi.fn<(obj: Blob | MediaSource) => string>(() => 'blob:mica-export')
    const revokeUrl = vi.fn<(url: string) => void>()
    URL.createObjectURL = createUrl
    URL.revokeObjectURL = revokeUrl

    const clicked: { href: string | null; download: string }[] = []
    let revokedOnceClickReturned: number | null = null
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push({ href: this.getAttribute('href'), download: this.download })
      // a microtask runs after the code that clicked has returned and before any timer,
      // so this sees a revoke made in the same task as the click
      queueMicrotask(() => {
        revokedOnceClickReturned = revokeUrl.mock.calls.length
      })
    })

    render(<MicaExportButton />)
    fireEvent.click(screen.getByRole('button', { name: 'Download JSON' }))

    await waitFor(() => expect(revokeUrl).toHaveBeenCalledWith('blob:mica-export'))
    expect(fetchSpy).toHaveBeenCalledWith('http://localhost:8787/dfns/audit/export', expect.anything())
    expect(clicked).toHaveLength(1)
    expect(clicked[0].href).toBe('blob:mica-export')
    expect(clicked[0].download).toMatch(/^mica-export-\d{4}-\d{2}-\d{2}\.json$/)
    const blob = createUrl.mock.calls[0][0] as Blob
    expect(blob.type).toMatch(/^application\/json/)
    expect(await blob.text()).toBe(EXPORT)
    expect(revokedOnceClickReturned).toBe(0)
    expect(revokeUrl).toHaveBeenCalledTimes(1)
  })
})
