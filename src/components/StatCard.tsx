import { cn } from '../utils/format'

interface StatCardProps {
  label: string
  value: string
  sub?: string
  trend?: number
}

export default function StatCard({ label, value, sub, trend }: StatCardProps) {
  return (
    <div
      className="rounded-3xl p-5"
      style={{
        background: 'linear-gradient(135deg, rgba(54, 147, 251, 0.15), rgba(255, 135, 112, 0.1))',
        border: '1px solid rgba(13, 45, 76, 0.08)',
      }}
    >
      <p className="text-text-secondary text-xs uppercase tracking-wider mb-2 font-medium">{label}</p>
      <p className="text-2xl font-semibold text-text" style={{ fontFamily: 'Outfit, Poppins, sans-serif' }}>{value}</p>
      {(sub || trend !== undefined) && (
        <div className="flex items-center gap-2 mt-1">
          {trend !== undefined && (
            <span className={cn('text-sm font-medium', trend >= 0 ? 'text-green' : 'text-red')}>
              {trend >= 0 ? '+' : ''}{trend.toFixed(2)}%
            </span>
          )}
          {sub && <span className="text-xs text-text-muted">{sub}</span>}
        </div>
      )}
    </div>
  )
}
