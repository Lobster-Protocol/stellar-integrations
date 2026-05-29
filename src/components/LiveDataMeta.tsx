import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { formatAgeMs } from '../utils/format'

export default function LiveDataMeta({
  dataUpdatedAt,
  isFetching,
  onRefresh,
}: {
  dataUpdatedAt: number
  isFetching: boolean
  onRefresh: () => void
}) {
  // tick once a second so the age label stays fresh
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])

  const label = dataUpdatedAt ? formatAgeMs(now - dataUpdatedAt) : '-'

  return (
    <div className="flex items-center gap-2 text-[10px] text-text-muted">
      <span>updated {label}</span>
      <button
        type="button"
        onClick={onRefresh}
        disabled={isFetching}
        aria-label="Refresh"
        className="p-1 rounded-full hover:bg-bg text-text-muted hover:text-text disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <RefreshCw size={11} className={isFetching ? 'animate-spin' : ''} />
      </button>
    </div>
  )
}
