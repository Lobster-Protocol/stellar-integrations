import { useDfnsSignatureStream } from '../integrations/dfns/useDfnsSignatureStream'
import type { DfnsEventKind } from '../integrations/dfns/types'
import { formatRelativeAgo } from '../utils/format'

const KIND_LABEL: Record<DfnsEventKind, string> = {
  'wallet.created': 'wallet created',
  'wallet.exported': 'wallet exported',
  'wallet.delegated': 'wallet delegated',
  'wallet.blockchainevent.detected': 'on-chain event',
  'wallet.signature.requested': 'signature requested',
  'wallet.signature.signed': 'signature signed',
  'wallet.signature.failed': 'signature failed',
  'wallet.signature.rejected': 'signature rejected',
  'wallet.transaction.requested': 'tx requested',
  'wallet.transaction.broadcasted': 'tx broadcasted',
  'wallet.transaction.confirmed': 'tx confirmed',
  'wallet.transaction.failed': 'tx failed',
  'wallet.transaction.rejected': 'tx rejected',
  'wallet.transfer.requested': 'transfer requested',
  'wallet.transfer.broadcasted': 'transfer broadcasted',
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

  return (
    <div className="rounded-3xl p-5 bg-bg-card card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text">MPC signature feed</h3>
        <span className="text-xs text-text-muted">{events.length} events</span>
      </div>

      {events.length === 0 ? (
        <p className="text-xs text-text-muted">
          Waiting for DFNS events. Trigger a signature from the wallet to see one.
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
