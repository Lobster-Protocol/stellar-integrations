import { useState } from 'react'

export default function MicaExportButton() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // an export with no records is not a failure, so it never renders in coral
  const [note, setNote] = useState<string | null>(null)

  const base = import.meta.env.VITE_LOBSTER_API_URL

  async function handleClick() {
    if (!base) return
    setBusy(true)
    setError(null)
    setNote(null)
    try {
      const token = import.meta.env.VITE_LOBSTER_API_TOKEN
      const res = await fetch(`${base}/dfns/audit/export`, {
        credentials: 'include',
        headers: token ? { 'x-lobster-token': token } : undefined,
      })
      if (!res.ok) throw new Error(`export ${res.status}`)
      const text = await res.text()
      const parsed = JSON.parse(text) as { records?: unknown[] }
      if (!parsed.records || parsed.records.length === 0) {
        // the records are built from DFNS webhook events, which the relay holds
        // in memory. a restart empties the store, so an empty file says nothing
        // has reached this instance since it came up.
        setNote(
          'The export ran and came back with no records. Every record is built from a DFNS webhook event, and this relay instance has received none since it last started.',
        )
        return
      }
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
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
          disabled={busy || !base}
          className="px-4 py-2 rounded-full bg-primary text-white text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? 'Building...' : 'Download JSON'}
        </button>
      </div>
      <p className="text-xs text-text-secondary">
        ISO 20022 record-keeping export aligned with ESMA RTS Table 3. Maps recent DFNS transaction
        and transfer events to the MiCA record schema.
      </p>
      {!base && (
        <p className="text-[11px] text-text-muted mt-2">
          Off in this build: VITE_LOBSTER_API_URL is not set, so there is no relay to ask for the
          records.
        </p>
      )}
      {note && <p className="text-xs text-text-muted mt-2">{note}</p>}
      {error && <p className="text-xs text-coral mt-2">{error}</p>}
    </div>
  )
}
