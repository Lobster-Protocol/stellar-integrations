import { useEffect, type ReactNode } from 'react'

import { cn } from '../utils/format'

// a styled replacement for window.confirm so a mainnet "this moves real funds" gate
// looks like the rest of the app instead of a bare browser dialog
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
  // Escape cancels, like the native dialog it stands in for
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        className="bg-bg-card rounded-3xl p-6 w-full max-w-sm card"
        onClick={(e) => e.stopPropagation()}
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
            onClick={onConfirm}
            autoFocus
            className={cn(
              'px-5 py-2 rounded-full text-white text-sm font-semibold transition-all',
              tone === 'danger' ? 'bg-coral hover:opacity-90' : 'bg-primary hover:bg-primary-dark',
            )}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
