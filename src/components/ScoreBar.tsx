import { cn } from '../utils/format'

interface Props {
  value: number
  label?: string
  size?: 'sm' | 'md'
}

function barColor(v: number) {
  if (v >= 75) return 'bg-green'
  if (v >= 50) return 'bg-primary'
  return 'bg-secondary'
}

export default function ScoreBar({ value, label, size = 'sm' }: Props) {
  const h = size === 'sm' ? 'h-1.5' : 'h-2'

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <div className="flex justify-between text-xs">
          <span className="text-text-muted">{label}</span>
          <span className="text-text-secondary font-medium">{value}%</span>
        </div>
      )}
      <div className={cn('w-full rounded-full bg-bg overflow-hidden', h)}>
        <div
          className={cn('h-full rounded-full transition-all duration-500', barColor(value))}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  )
}
