import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'

import { cn } from '../utils/format'

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

  // no clipboard outside a secure context, and a dead button is worse than none
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
          // the browser said no; don't claim a copy
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
