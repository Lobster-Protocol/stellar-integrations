import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'

import { cn } from '../utils/format'

// Every address and hash on the dashboard is shown shortened, which is readable
// but useless if you need the real thing in an explorer or a ticket.
export default function CopyButton({
  value,
  what,
  className,
}: {
  value: string
  what: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  // No clipboard outside a secure context, and a button that silently does
  // nothing is worse than one that isn't there.
  if (typeof navigator === 'undefined' || !navigator.clipboard) return null

  return (
    <button
      type="button"
      aria-label={copied ? `${what} copied` : `Copy ${what}`}
      title={copied ? 'Copied' : `Copy ${what}`}
      onClick={async (e) => {
        e.stopPropagation()
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
        } catch {
          // the browser refused, so say nothing rather than claim a copy
        }
      }}
      className={cn(
        'shrink-0 p-1 rounded text-text-muted hover:text-primary transition-colors',
        className,
      )}
    >
      {copied ? <Check size={12} className="text-ok" /> : <Copy size={12} />}
    </button>
  )
}
