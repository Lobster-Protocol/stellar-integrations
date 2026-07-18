import { useNetwork } from '../contexts/NetworkContext'
import { useTtlStatus, type TtlLevel } from '../integrations/ttl/hooks'
import { shortenAddress } from '../utils/format'
import LiveDataMeta from './LiveDataMeta'

const LEVEL_STYLE: Record<TtlLevel, { dot: string; text: string; label: string }> = {
  ok: { dot: 'bg-emerald-400', text: 'text-emerald-400', label: 'healthy' },
  warn: { dot: 'bg-amber-400', text: 'text-amber-400', label: 'extend soon' },
  crit: { dot: 'bg-coral', text: 'text-coral', label: 'extend now' },
  archived: { dot: 'bg-zinc-500', text: 'text-text-muted', label: 'archived' },
}

// decompose seconds into a short d/h/m label. no thresholds here; the bands
// that drive the colour are decided server-side and arrive as the level.
function formatRemaining(seconds: number): string {
  if (seconds <= 0) return 'expired'
  const d = Math.floor(seconds / 86_400)
  const h = Math.floor((seconds % 86_400) / 3_600)
  const m = Math.floor((seconds % 3_600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export default function TtlCountdownCard() {
  const { network } = useNetwork()
  const ttl = useTtlStatus(network)

  return (
    <div className="rounded-3xl p-5 bg-bg-card card">
      <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-text">Contract storage TTL</h3>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-text-muted">live | Soroban RPC | {network}</span>
          <LiveDataMeta
            dataUpdatedAt={ttl.dataUpdatedAt}
            isFetching={ttl.isFetching}
            onRefresh={() => ttl.refetch()}
          />
        </div>
      </div>

      {ttl.isLoading ? (
        <p className="text-xs text-text-muted">Loading...</p>
      ) : ttl.isError ? (
        <p className="text-xs text-text-secondary">
          No TTL feed on {network} yet.
        </p>
      ) : !ttl.data || ttl.data.statuses.length === 0 ? (
        <p className="text-xs text-text-secondary">No storage keys tracked yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {ttl.data.statuses.map((s) => {
            const style = LEVEL_STYLE[s.level]
            return (
              <li
                key={s.key}
                className="px-3 py-2 rounded-xl bg-bg flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${style.dot}`} />
                  <span className="font-mono text-[10px] text-text-muted truncate">{shortenAddress(s.key, 10, 6)}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-[10px] ${style.text}`}>{style.label}</span>
                  <span className="text-text font-medium tabular-nums">
                    {formatRemaining(s.remainingSeconds)}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
