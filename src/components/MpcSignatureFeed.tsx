import { useDfnsSignatureStream } from '../integrations/dfns/useDfnsSignatureStream'
import type { DfnsEventKind } from '../integrations/dfns/types'
import { formatRelativeAgo } from '../utils/format'
import { NotConfigured } from './ui'
import { InfoTip } from './InfoTip'

const KIND_LABEL: Record<DfnsEventKind, string> = {
  'wallet.created': 'wallet created',
  'wallet.exported': 'wallet exported',
  'wallet.delegated': 'wallet delegated',
  'wallet.blockchainevent.detected': 'on-chain event',
  'wallet.signature.requested': 'signature requested',
  'wallet.signature.signed': 'signature signed',
  'wallet.signature.failed': 'signature failed',
  'wallet.signature.rejected': 'signature rejected',
  'wallet.transaction.requested': 'transaction requested',
  'wallet.transaction.broadcasted': 'transaction sent',
  'wallet.transaction.confirmed': 'transaction confirmed',
  'wallet.transaction.failed': 'transaction failed',
  'wallet.transaction.rejected': 'transaction rejected',
  'wallet.transfer.requested': 'transfer requested',
  'wallet.transfer.broadcasted': 'transfer sent',
  'wallet.transfer.confirmed': 'transfer confirmed',
  'wallet.transfer.failed': 'transfer failed',
  'wallet.transfer.rejected': 'transfer rejected',
  'policy.triggered': 'policy triggered',
  'policy.approval.pending': 'approval pending',
  'policy.approval.resolved': 'approval resolved',
}

function isTerminalKind(k: DfnsEventKind): boolean {
  return (
    k === 'wallet.signature.signed' ||
    k === 'wallet.transaction.confirmed' ||
    k === 'wallet.transfer.confirmed' ||
    k === 'policy.approval.resolved'
  )
}

export default function MpcSignatureFeed() {
  const events = useDfnsSignatureStream()

  if (!import.meta.env.VITE_LOBSTER_API_URL) {
    return (
      <NotConfigured title="Signing activity" needs="VITE_LOBSTER_API_URL">
        The lifecycle events DFNS custody sends as a webhook, streamed as they land. This build has
        no relay to stream from.
      </NotConfigured>
    )
  }

  return (
    <div className="rounded-3xl p-5 bg-bg-card card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text">
          Signing activity <InfoTip term="mpc" label="MPC signing" />
        </h3>
        <span className="text-xs text-text-muted">{events.length} events</span>
      </div>

      {events.length === 0 ? (
        <p className="text-xs text-text-muted">
          Empty. This feed carries one thing: the events DFNS custody sends the relay by webhook.
          A signature from your browser wallet is not one of them and will not appear. The relay
          keeps the events in memory too, so the feed starts over from nothing every time the
          service restarts.
        </p>
      ) : (
        <ul className="divide-y divide-text-muted/10">
          {events.slice(0, 50).map((e) => (
            <li key={e.id} className="py-2 flex items-center justify-between gap-2 text-xs">
              <span className="font-mono truncate text-text-secondary">{e.id}</span>
              <span className={isTerminalKind(e.kind) ? 'text-green' : 'text-text'}>
                {KIND_LABEL[e.kind]}
              </span>
              <span className="text-text-muted">{formatRelativeAgo({ unixSec: e.timestampSent })}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
