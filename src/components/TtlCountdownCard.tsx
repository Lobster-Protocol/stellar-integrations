import { AlertTriangle, Archive, CheckCircle2, OctagonAlert, type LucideIcon } from 'lucide-react'

import { CONTRACTS } from '../config/contracts'
import { useNetwork } from '../contexts/NetworkContext'
import { useTtlStatus, type TtlLevel } from '../integrations/ttl/hooks'
import LiveDataMeta from './LiveDataMeta'
import { Failed } from './ui'
import { InfoTip } from './InfoTip'

// amber and red look alike under deuteranopia, so the icon and word carry the level too
const LEVEL_STYLE: Record<TtlLevel, { text: string; label: string; icon: LucideIcon }> = {
  ok: { text: 'text-ok', label: 'healthy', icon: CheckCircle2 },
  warn: { text: 'text-warn', label: 'extend soon', icon: AlertTriangle },
  crit: { text: 'text-crit', label: 'extend now', icon: OctagonAlert },
  archived: { text: 'text-text-muted', label: 'archived', icon: Archive },
}

// the relay sends the kind because the wasm hash alone can't tell the two code entries apart
const KIND_LABEL: Record<string, string> = {
  instance: 'Factory instance',
  'factory-code': 'Factory code',
  'vault-code': 'Vault code',
}

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

  // without a Factory the feed answers 503
  const deployed = !!CONTRACTS[network].lobster.factory
  const other = network === 'mainnet' ? 'testnet' : 'mainnet'
  const otherDeployed = !!CONTRACTS[other].lobster.factory

  // with no feed address the gated query sits pending forever, which must not
  // read as an empty ledger
  const feedConfigured = !!import.meta.env.VITE_LOBSTER_API_URL

  // an unreachable host makes fetch throw TypeError, unlike the relay's own errors
  const unreachable = ttl.error instanceof TypeError

  const reading = deployed && feedConfigured
  const live = reading && !ttl.isError && !!ttl.data

  return (
    <div className="rounded-3xl p-5 bg-bg-card card">
      <div className="flex items-baseline justify-between mb-1 gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-text">
          Contract storage lease <InfoTip term="ttl" label="the storage lease" />
        </h3>
        <div className="flex items-center gap-3">
          {live && <span className="text-[11px] text-text-muted">live | on-chain | {network}</span>}
          {reading && (
            <LiveDataMeta
              dataUpdatedAt={ttl.dataUpdatedAt}
              isFetching={ttl.isFetching}
              onRefresh={() => ttl.refetch()}
            />
          )}
        </div>
      </div>
      <p className="text-xs text-text-secondary mb-3">
        Time left before each of the Factory's on-chain storage entries is archived. The contract keeps working after that, but the next transaction that needs an archived entry pays to restore it first.
      </p>

      {!deployed ? (
        <p className="text-xs text-text-secondary">
          The Factory is not deployed on {network}, so there is no storage lease to watch here.
          {otherDeployed && ` Switch to ${other} for the entries that are live.`}
        </p>
      ) : !feedConfigured ? (
        <p className="text-xs text-text-secondary">
          This build has no address for the storage feed, so nothing has been read.
        </p>
      ) : ttl.isLoading ? (
        <p className="text-xs text-text-muted">Reading the ledger...</p>
      ) : ttl.isError ? (
        <Failed
          what={
            unreachable
              ? 'The storage feed did not answer, so nothing has been read.'
              : (ttl.error as Error).message
          }
          onRetry={() => ttl.refetch()}
        />
      ) : !ttl.data || ttl.data.statuses.length === 0 ? (
        <p className="text-xs text-text-secondary">The feed answered with no entries to watch.</p>
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
                  <span className="text-text truncate" title={s.key}>{KIND_LABEL[s.kind ?? ''] ?? 'Storage entry'}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-[10px] ${style.text}`}>{style.label}</span>
                  <span className="text-text font-medium tabular-nums">
                    {formatRemaining(s.remainingSeconds)}
                    {s.remainingSeconds > 0 && ' left'}
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
