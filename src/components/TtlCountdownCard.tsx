import { xdr } from '@stellar/stellar-sdk'
import { AlertTriangle, Archive, CheckCircle2, OctagonAlert, type LucideIcon } from 'lucide-react'

import { CONTRACTS } from '../config/contracts'
import { useNetwork } from '../contexts/NetworkContext'
import { useTtlStatus, type TtlLevel } from '../integrations/ttl/hooks'
import LiveDataMeta from './LiveDataMeta'
import { Failed } from './ui'
import { InfoTip } from './InfoTip'

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

  // there is only something to watch where the Factory is deployed. asking the
  // feed about a network we never deployed to earns a 503, and the reader is
  // better served by the reason than by the relay's refusal.
  const deployed = !!CONTRACTS[network].lobster.factory
  const other = network === 'mainnet' ? 'testnet' : 'mainnet'
  const otherDeployed = !!CONTRACTS[other].lobster.factory

  // the hook is gated on the same variable, so with no feed address the query
  // never fires and sits pending. that is a build nobody pointed at the feed,
  // not a ledger with nothing on it, and the card used to conflate the two.
  const feedConfigured = !!import.meta.env.VITE_LOBSTER_API_URL

  // fetch rejects with a TypeError when it cannot reach the host at all: wrong
  // port, service down, origin the relay does not allow. There is no response
  // to read a reason off, so the browser's own "Failed to fetch" is what came
  // through to the card. The relay's explanations arrive as plain Errors.
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
          {/* a failed read is not a live one, so the badge goes with the data */}
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
        Time left before each of the Factory's on-chain storage entries expires. Once it does, the contract stops responding until the entry is restored.
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
