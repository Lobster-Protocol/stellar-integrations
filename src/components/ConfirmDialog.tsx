import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { cn } from '../utils/format'

// a styled replacement for window.confirm so a mainnet "this moves real funds" gate
// looks like the rest of the app instead of a bare browser dialog. Rendered through a
// portal so it never nests inside another modal's focus trap, and keeps Tab to itself.
export default function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel = 'Continue',
  cancelLabel = 'Cancel',
  tone = 'primary',
  onConfirm,
  onCancel,
}: {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'primary' | 'danger'
  onConfirm: () => void
  onCancel: () => void
}) {
  const cardRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)

  // Escape cancels, like the native dialog it stands in for; focus the confirm button on
  // open and hand focus back to wherever it was when the dialog closes
  useEffect(() => {
    if (!open) return
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      before?.focus()
    }
  }, [open, onCancel])

  if (!open) return null

  // Tab stays on the two buttons, so it never lands on the form behind the overlay
  const keepTabInside = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !cardRef.current) return
    const items = cardRef.current.querySelectorAll<HTMLElement>('button:not([disabled])')
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const at = document.activeElement
    if (e.shiftKey && (at === first || at === cardRef.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && at === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        ref={cardRef}
        role="alertdialog"
        aria-modal="true"
        className="bg-bg-card rounded-3xl p-6 w-full max-w-sm card"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={keepTabInside}
      >
        <h2 className="text-lg font-semibold text-text mb-2">{title}</h2>
        <div className="text-sm text-text-secondary mb-5 space-y-1">{children}</div>
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-full bg-bg text-text-secondary text-sm font-medium hover:opacity-80"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={onConfirm}
            className={cn(
              'px-5 py-2 rounded-full text-white text-sm font-semibold transition-all',
              tone === 'danger' ? 'bg-coral hover:opacity-90' : 'bg-primary hover:bg-primary-dark',
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
