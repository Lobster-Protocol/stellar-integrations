import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Check, X, AlertCircle, Info } from 'lucide-react'

import { cn } from '../utils/format'

type ToastKind = 'success' | 'error' | 'info'
interface Toast {
  id: number
  kind: ToastKind
  message: string
}

interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const Ctx = createContext<ToastApi | null>(null)

// A tiny transient-notification stack, top-right, so the app can acknowledge things
// that used to happen silently - a wallet connecting, a connection failing. No
// dependency: a portal on document.body, above the +MPC popover (z-1000).
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const push = useCallback(
    (kind: ToastKind, message: string) => {
      const id = idRef.current++
      // keep at most a few on screen; the newest is what matters
      setToasts((t) => [...t.slice(-3), { id, kind, message }])
      setTimeout(() => dismiss(id), 4500)
    },
    [dismiss],
  )

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push],
  )

  return (
    <Ctx.Provider value={api}>
      {children}
      {typeof document !== 'undefined' &&
        createPortal(
          <div className="fixed top-16 right-3 z-[1100] flex flex-col gap-2 pointer-events-none">
            {toasts.map((t) => (
              <div
                key={t.id}
                role="status"
                aria-live="polite"
                className={cn(
                  'pointer-events-auto flex items-start gap-2 rounded-2xl border bg-bg-card shadow-xl px-3 py-2 text-xs max-w-xs',
                  t.kind === 'success' && 'border-ok/30',
                  t.kind === 'error' && 'border-coral/30',
                  t.kind === 'info' && 'border-text-muted/20',
                )}
              >
                <span className="mt-0.5 shrink-0">
                  {t.kind === 'success' ? (
                    <Check size={14} className="text-ok" />
                  ) : t.kind === 'error' ? (
                    <AlertCircle size={14} className="text-coral" />
                  ) : (
                    <Info size={14} className="text-text-muted" />
                  )}
                </span>
                <span className="text-text leading-snug">{t.message}</span>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss"
                  className="ml-auto shrink-0 text-text-muted hover:text-text"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </Ctx.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useToast must be used inside <ToastProvider>')
  return v
}
