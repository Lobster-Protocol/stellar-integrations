import { useState } from 'react'
import { Download } from 'lucide-react'

import { downloadText } from '../utils/download'
import { cn } from '../utils/format'

export interface ExportFormat {
  label: string
  ext: string
  mime: string
  // `report` drives the status line while a long read is in flight; `note` is
  // what the reader is told once the file is on their disk.
  build: (report: (message: string) => void) => Promise<{ text: string; note?: string }>
}

export default function ExportButton({
  name,
  formats,
  disabled,
  hint,
  disabledHint,
  label,
  className,
}: {
  name: string
  formats: ExportFormat[]
  disabled?: boolean
  hint?: string
  disabledHint?: string
  label?: string
  className?: string
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  async function run(f: ExportFormat) {
    setBusy(f.ext)
    setFailed(false)
    setStatus('Reading...')
    try {
      const { text, note } = await f.build(setStatus)
      downloadText(`${name}.${f.ext}`, f.mime, text)
      setStatus(note ?? 'Downloaded.')
    } catch (err) {
      setFailed(true)
      setStatus(`Couldn't build the file: ${(err as Error).message}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className={cn('text-right', className)}>
      <div className="flex items-center justify-end gap-1.5">
        {label && <span className="text-[11px] text-text-muted">{label}</span>}
        <Download size={13} className="text-text-muted" aria-hidden />
        {formats.map((f) => (
          <button
            key={f.ext}
            type="button"
            onClick={() => run(f)}
            disabled={disabled || busy !== null}
            title={disabled ? (disabledHint ?? hint) : hint}
            className="px-2.5 py-1 rounded-full bg-bg text-xs text-text-secondary hover:text-text disabled:opacity-40 disabled:hover:text-text-secondary"
          >
            {busy === f.ext ? 'Working...' : f.label}
          </button>
        ))}
      </div>
      {status && (
        <p
          aria-live="polite"
          className={cn('text-[11px] mt-1', failed ? 'text-coral' : 'text-text-muted')}
        >
          {status}
        </p>
      )}
    </div>
  )
}
