import { useState, useRef, useEffect, type ReactNode } from 'react'
import { Info } from 'lucide-react'

import { GLOSSARY, type GlossaryKey } from '../copy/glossary'

// A small "i" that sits next to a technical label. Hover or keyboard-focus to
// read a plain-language definition; a tap toggles it on touch screens, where
// there is no hover. Text comes from the shared glossary via `term`, or inline
// via children for one-off notes.
export function InfoTip({
  term,
  children,
  label,
}: {
  term?: GlossaryKey
  children?: ReactNode
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const text = children ?? (term ? GLOSSARY[term] : '')

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        type="button"
        aria-label={label ? `What ${label} means` : 'More information'}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="text-text-muted hover:text-primary focus:text-primary outline-none"
      >
        <Info size={13} strokeWidth={2} aria-hidden />
      </button>
      {open && text && (
        <span
          role="tooltip"
          className="absolute left-1/2 top-full z-50 mt-1.5 w-56 max-w-[70vw] -translate-x-1/2 rounded-xl border border-border bg-bg-card px-3 py-2 text-[11px] font-normal normal-case leading-relaxed tracking-normal text-text-secondary shadow-lg"
        >
          {text}
        </span>
      )}
    </span>
  )
}
