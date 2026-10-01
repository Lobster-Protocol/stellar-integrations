import { ExternalLink } from 'lucide-react'

import { cn, shortenAddress, stellarExplorer } from '../utils/format'
import { STELLAR_CCTP_DOMAIN, cctpChainsFor, type Network } from '../config/contracts'
import { useAttestation } from '../integrations/cctp/hooks'
import { directionOf, forgetTransfer, type TrackedTransfer } from '../integrations/cctp/transfers'
import { elapsed, statusLine, statusOf, useNow, type Tone } from '../integrations/cctp/status'

const TONE_CLASS: Record<Tone, string> = {
  wait: 'bg-bg text-text-secondary',
  act: 'bg-primary/10 text-primary',
  done: 'bg-green/10 text-green',
  warn: 'bg-coral/10 text-coral',
}

// Circle's view of one transfer, shared with the background watcher through the query cache
function useTransferStatus(network: Network, t: TrackedTransfer) {
  const out = directionOf(t) === 'from-stellar'
  const chain = cctpChainsFor(network).find((c) => c.key === t.chainKey) ?? null
  const att = useAttestation(network, t.sourceDomain, t.id, {
    destinationDomain: out ? chain?.domain : STELLAR_CCTP_DOMAIN,
    untilForwarded: out && !!t.forwarded,
  })
  return { status: statusOf(t, att.data), error: att.isError }
}

export function InProgressRow({
  network,
  transfer: t,
  onOpen,
}: {
  network: Network
  transfer: TrackedTransfer
  onOpen: (t: TrackedTransfer) => void
}) {
  const { status, error } = useTransferStatus(network, t)
  const now = useNow(true, 5_000)
  const line = statusLine(t, status)
  const out = directionOf(t) === 'from-stellar'
  return (
    <li className="flex items-center justify-between gap-3 py-2.5 text-xs flex-wrap">
      <span className="flex flex-col gap-1 min-w-0">
        <span className="text-text">
          {t.amount} USDC {out ? 'to' : 'from'} {t.chainName}
          <span className="text-text-muted ml-2">{new Date(t.createdAt).toLocaleString('en-GB')}</span>
        </span>
        <span className="flex items-center gap-2 flex-wrap">
          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', TONE_CLASS[line.tone])}>{line.text}</span>
          <span className="text-[10px] text-text-muted">
            {out ? `Stellar to ${t.chainName}` : `${t.chainName} to Stellar`}, started {elapsed(t.createdAt, now)} ago
          </span>
          {error && <span className="text-[10px] text-coral">Circle did not answer, retrying</span>}
        </span>
      </span>
      <span className="flex items-center gap-3 shrink-0">
        <button
          onClick={() => {
            if (window.confirm('Stop tracking this transfer here? It stays on chain either way.')) {
              forgetTransfer(network, t.id)
            }
          }}
          className="text-text-muted hover:text-coral"
        >
          forget
        </button>
        <button onClick={() => onOpen(t)} className="px-3 py-1 rounded-full bg-primary text-white font-medium">
          Finish
        </button>
      </span>
    </li>
  )
}

export function HistoryRow({ network, transfer: t }: { network: Network; transfer: TrackedTransfer }) {
  const out = directionOf(t) === 'from-stellar'
  const chain = cctpChainsFor(network).find((c) => c.key === t.chainKey) ?? null
  const burnHref = out ? stellarExplorer(network, 'tx', t.id) : chain?.explorerTx(t.id)
  const landHref = t.deliveredHash ? (out ? chain?.explorerTx(t.deliveredHash) : stellarExplorer(network, 'tx', t.deliveredHash)) : undefined
  return (
    <li className="flex items-center justify-between gap-3 py-2.5 text-xs flex-wrap">
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="text-text">
          <span className="font-medium">{t.amount} USDC</span>
          <span className="text-text-secondary"> · {out ? `Stellar to ${t.chainName}` : `${t.chainName} to Stellar`}</span>
        </span>
        <span className="text-[10px] text-text-muted">
          {new Date(t.createdAt).toLocaleString('en-GB')}
          {t.deliveredAt && `, arrived after ${elapsed(t.createdAt, t.deliveredAt)}`}
          {out && t.forwarded ? ', minted by Circle' : ''}
        </span>
      </span>
      <span className="flex items-center gap-3 shrink-0 text-[11px]">
        {burnHref && (
          <a href={burnHref} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
            burn {shortenAddress(t.id.replace(/^0x/, ''), 4, 4)} <ExternalLink size={10} />
          </a>
        )}
        {landHref ? (
          <a href={landHref} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
            {out ? 'mint' : 'delivery'} {shortenAddress(t.deliveredHash!.replace(/^0x/, ''), 4, 4)} <ExternalLink size={10} />
          </a>
        ) : (
          <span className="text-text-muted">finished elsewhere</span>
        )}
      </span>
    </li>
  )
}
