import { useState } from 'react'

export default function MicaExportButton() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!import.meta.env.VITE_LOBSTER_API_URL) return null

  async function handleClick() {
    setBusy(true)
    setError(null)
    try {
      const base = import.meta.env.VITE_LOBSTER_API_URL
      const token = import.meta.env.VITE_LOBSTER_API_TOKEN
      const res = await fetch(`${base}/dfns/audit/export`, {
        credentials: 'include',
        headers: token ? { 'x-lobster-token': token } : undefined,
      })
      if (!res.ok) throw new Error(`export ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `mica-export-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-3xl p-5 bg-bg-card card">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-text">MiCA audit export</h3>
        <button
          type="button"
          onClick={handleClick}
          disabled={busy}
          className="px-4 py-2 rounded-full bg-primary text-white text-xs font-semibold disabled:opacity-40"
        >
          {busy ? 'Building...' : 'Download JSON'}
        </button>
      </div>
      <p className="text-xs text-text-secondary">
        ISO 20022 record-keeping export aligned with ESMA RTS Table 3. Maps recent DFNS transaction
        and transfer events to the MiCA record schema.
      </p>
      {error && <p className="text-xs text-coral mt-2">{error}</p>}
    </div>
  )
}
