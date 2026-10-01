import type { ReactNode } from 'react'
import { Check, ExternalLink } from 'lucide-react'

import { cn } from '../utils/format'
import { clock } from '../integrations/cctp/status'

export interface Step {
  label: ReactNode
  done: boolean
  // the step happening now, or the one waiting for the person
  current?: boolean
  at?: number
  link?: { href: string; text: string }
}

export function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="space-y-2.5 mb-5">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-3 text-xs">
          <span
            className={cn(
              'shrink-0 h-5 w-5 rounded-full flex items-center justify-center text-[10px]',
              s.done ? 'bg-green/15 text-green' : s.current ? 'bg-primary/15 text-primary' : 'bg-bg text-text-secondary',
            )}
          >
            {s.done ? <Check size={12} /> : i + 1}
          </span>
          <span className="flex flex-col gap-0.5 min-w-0">
            <span className={s.done ? 'text-text' : s.current ? 'text-text font-medium' : 'text-text-secondary'}>
              {s.label}
              {s.at && <span className="text-text-muted font-normal"> · {clock(s.at)}</span>}
            </span>
            {s.link && (
              <a
                href={s.link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline inline-flex items-center gap-1 text-[11px] w-fit"
              >
                {s.link.text} <ExternalLink size={10} />
              </a>
            )}
          </span>
        </li>
      ))}
    </ol>
  )
}
