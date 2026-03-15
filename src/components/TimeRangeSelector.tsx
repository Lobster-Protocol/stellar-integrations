import { type TimeRange } from '../data/mock'
import { cn } from '../utils/format'

const RANGES: TimeRange[] = ['1D', '1W', '1M', '3M', '6M', 'ALL']

interface Props {
  value: TimeRange
  onChange: (r: TimeRange) => void
}

const TimeRangeSelector = ({ value, onChange }: Props) => (
  <div className="flex items-center gap-1 bg-bg rounded-full p-0.5">
    {RANGES.map(r => (
      <button
        key={r}
        onClick={() => onChange(r)}
        className={cn(
          'px-3 py-1 rounded-full text-xs font-medium transition-all',
          value === r ? 'bg-bg-card text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'
        )}
      >
        {r}
      </button>
    ))}
  </div>
)

export default TimeRangeSelector
