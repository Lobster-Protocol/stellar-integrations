import { useId, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

import { cn } from '../utils/format'

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-3xl p-5 bg-bg-card card', className)}>{children}</div>
}

// Card header. `note` is the one-line explanation of what the card shows, which
// is what makes a panel readable without a manual; `meta` is the live/updated
// cluster that sits on the right.
export function CardHead({
  title,
  note,
  meta,
}: {
  title: string
  note?: string
  meta?: ReactNode
}) {
  return (
    <div className="mb-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-text">{title}</h3>
        {meta && <div className="flex items-center gap-3">{meta}</div>}
      </div>
      {note && <p className="text-xs text-text-secondary mt-1 max-w-2xl">{note}</p>}
    </div>
  )
}

// An empty panel should say what would fill it, not just that it is empty.
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="py-6 text-center">
      <p className="text-xs text-text-secondary">{children}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function Failed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <div className="py-6 text-center text-xs space-y-2">
      <p className="text-coral">{what}</p>
      <button onClick={onRetry} className="text-primary hover:underline">
        Try again
      </button>
    </div>
  )
}

export type Tone = 'plain' | 'up' | 'down' | 'accent'

const TONE_CLASS: Record<Tone, string> = {
  plain: 'text-text',
  up: 'text-green',
  down: 'text-red',
  accent: 'text-primary',
}

// The single stat tile the whole dashboard uses. Replaces the three near-copies
// that had drifted apart across Overview, Performance and Positions.
export function Stat({
  label,
  value,
  sub,
  tone = 'plain',
  hint,
  href,
  mono,
}: {
  label: ReactNode
  value: string
  sub?: ReactNode
  tone?: Tone
  hint?: string
  href?: string
  mono?: boolean
}) {
  const body = (
    <span
      className={cn('text-lg font-semibold', TONE_CLASS[tone], mono && 'font-mono text-sm')}
      style={{ fontFamily: mono ? undefined : 'Outfit' }}
    >
      {value}
    </span>
  )
  return (
    <div
      className="rounded-2xl px-4 py-3 bg-bg-card"
      style={{ border: '1px solid rgba(13, 45, 76, 0.08)' }}
      title={hint}
    >
      <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">{label}</div>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="hover:underline">
          {body}
        </a>
      ) : (
        body
      )}
      {sub && <div className="text-[11px] text-text-muted mt-0.5">{sub}</div>}
    </div>
  )
}

// A chart is a picture to a screen reader and to anyone who cannot separate the
// colours, so every one of ours is named and can be read as numbers instead.
// `rows` is what the chart plots; pass it and the reader gets a table toggle.
export function ChartFrame({
  label,
  columns,
  rows,
  children,
}: {
  label: string
  columns?: string[]
  rows?: Array<Array<string | number>>
  children: ReactNode
}) {
  const [asTable, setAsTable] = useState(false)
  const canTable = !!rows && rows.length > 0 && !!columns

  return (
    <figure className="m-0">
      {canTable && (
        <div className="flex justify-end -mt-1 mb-1">
          <button
            type="button"
            onClick={() => setAsTable(!asTable)}
            className="text-[11px] text-text-muted hover:text-primary"
          >
            {asTable ? 'Show chart' : 'Show numbers'}
          </button>
        </div>
      )}

      {asTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <caption className="sr-only">{label}</caption>
            <thead>
              <tr className="text-text-muted text-left">
                {columns!.map((c, i) => (
                  <th key={c} scope="col" className={`font-normal pb-1 ${i > 0 ? 'text-right' : ''}`}>
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows!.map((r, ri) => (
                <tr key={ri}>
                  {r.map((cell, ci) => (
                    <td
                      key={ci}
                      className={`py-1.5 ${ci > 0 ? 'text-right tabular-nums text-text' : 'text-text-secondary'}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div role="img" aria-label={label}>
          {children}
        </div>
      )}
    </figure>
  )
}

// Drill-down: the page reads simply until someone opens this.
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: string
  children: ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const id = useId()
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={id}
        className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text"
      >
        <ChevronDown size={13} className={cn('transition-transform', open && 'rotate-180')} />
        {summary}
      </button>
      {open && (
        <div id={id} className="mt-3">
          {children}
        </div>
      )}
    </div>
  )
}
