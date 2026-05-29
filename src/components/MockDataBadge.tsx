import { Info } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function MockDataBadge() {
  return (
    <div
      className="rounded-2xl px-3 py-2 flex items-start gap-2 text-xs bg-yellow/10 border border-yellow/25 print:hidden"
      role="note"
    >
      <Info size={14} className="text-yellow mt-0.5 shrink-0" aria-hidden="true" />
      <div className="text-text-secondary">
        <span className="text-text font-medium">Preview data.</span>{' '}
        Numbers on this page come from a seeded mock so the strategy view
        works without a live position. The real on-chain figures live on{' '}
        <Link to="/positions" className="text-primary hover:underline font-medium">
          the Positions page
        </Link>
        .
      </div>
    </div>
  )
}
