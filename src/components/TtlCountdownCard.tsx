import { xdr } from '@stellar/stellar-sdk'
import { AlertTriangle, Archive, CheckCircle2, OctagonAlert, type LucideIcon } from 'lucide-react'

import { useNetwork } from '../contexts/NetworkContext'
import { useTtlStatus, type TtlLevel } from '../integrations/ttl/hooks'
import LiveDataMeta from './LiveDataMeta'

// Amber and red read as the same hue under deuteranopia whatever lightness we
// pick, so the level is carried by the icon and the word as well as the colour.
const LEVEL_STYLE: Record<TtlLevel, { text: string; label: string; icon: LucideIcon }> = {
  ok: { text: 'text-ok', label: 'healthy', icon: CheckCircle2 },
  warn: { text: 'text-warn', label: 'extend soon', icon: AlertTriangle },
  crit: { text: 'text-crit', label: 'extend now', icon: OctagonAlert },
  archived: { text: 'text-text-muted', label: 'archived', icon: Archive },
}

// the feed returns each watched entry as a base64 ledger key. decode the key
// type so a reader sees "Contract instance" instead of opaque base64.
function keyLabel(keyXdr: string): string {
  try {
    const k = xdr.LedgerKey.fromXDR(keyXdr, 'base64')
    if (k.switch().name === 'contractCode') return 'Contract code'
    if (k.switch().name === 'contractData') {
      const cd = k.contractData()
      if (cd.key().switch().name === 'scvLedgerKeyContractInstance') return 'Contract instance'
      return cd.durability().name === 'persistent' ? 'Persistent storage' : 'Temporary storage'
    }
    return 'Storage entry'
  } catch {
    return 'Storage entry'
  }
}

// no thresholds here; the bands that drive the colour are decided server-side
// and arrive as the level.
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
      <div className="flex items-baseline justify-between mb-1 gap-3 flex-wrap">
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
      <p className="text-xs text-text-secondary mb-3">
        Time left before each of the factory's on-chain storage entries expires. Once archived, reads fail until the entry is restored.
      </p>

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
            const Icon = style.icon
            return (
              <li
                key={s.key}
                className="px-3 py-2 rounded-xl bg-bg flex items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon size={13} className={`shrink-0 ${style.text}`} aria-hidden />
                  <span className="text-text truncate" title={s.key}>{keyLabel(s.key)}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-[10px] ${style.text}`}>{style.label}</span>
                  <span className="text-text font-medium tabular-nums">
                    {formatRemaining(s.remainingSeconds)} left
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
