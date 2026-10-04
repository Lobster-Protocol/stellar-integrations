import { ExternalLink } from 'lucide-react'
import { useAccount } from 'wagmi'

import { cn, shortenAddress, stellarExplorer } from '../utils/format'
import { STELLAR_CCTP_DOMAIN, cctpChainsFor, type Network } from '../config/contracts'
import { useAttestation } from '../integrations/cctp/hooks'
import { directionOf, forgetTransfer, SEARCH_EVENT, useSearches, walletsToSearch, type TrackedTransfer } from '../integrations/cctp/transfers'
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
          <span className="text-text-secondary">, for {shortenAddress(t.recipient, 6, 4)}</span>
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

// what the page looked at on chain for transfers that never arrived, and when: shown so a
// person back on another device knows the list is not only this browser's memory
export function SearchSummary({ network, stellar }: { network: Network; stellar: string | null }) {
  const connectedEvm = useAccount().address
  const searches = useSearches(network)
  const now = useNow(true, 30_000)
  const chains = cctpChainsFor(network)
  const wallets = walletsToSearch(network, stellar, connectedEvm)
  if (wallets.stellar.length === 0 && wallets.evm.length === 0) {
    return (
      <p className="text-[11px] text-text-muted">
        Connect the wallets you bridged with: the page then looks on chain for any transfer of theirs that has not arrived.
      </p>
    )
  }
  const stellarRecs = wallets.stellar.map((a) => ({ a, r: searches[`stellar:${a}`] }))
  const evmRecs = wallets.evm.flatMap((a) => chains.map((c) => ({ a, c, r: searches[`evm:${c.key}:${a.toLowerCase()}`] })))
  const last = Math.max(0, ...[...stellarRecs, ...evmRecs].map((x) => x.r?.at ?? 0))
  const names = (xs: string[]) => xs.map((a) => shortenAddress(a, 6, 4)).join(', ')
  const once = (xs: string[]) => [...new Set(xs)]
  // only what has been read so far; the rest is said to be under way
  const stellarRead = stellarRecs.filter((x) => x.r).map((x) => x.a)
  const evmRead = evmRecs.filter((x) => x.r)
  const parts = [
    stellarRead.length ? `burns out of ${names(stellarRead)} over the last 30 days` : null,
    evmRead.length
      ? `burns from ${names(once(evmRead.map((x) => x.a)))} on ${once(evmRead.map((x) => x.c.name)).join(', ')} over about the last day`
      : null,
  ].filter(Boolean)
  const reading = once([...stellarRecs.filter((x) => !x.r).map(() => 'Stellar'), ...evmRecs.filter((x) => !x.r).map((x) => x.c.name)])
  const partial = once([
    ...stellarRecs.filter((x) => x.r && !x.r.complete).map(() => 'Stellar'),
    ...evmRecs.filter((x) => x.r && !x.r.complete).map((x) => x.c.name),
  ])
  const notConnected = wallets.evm.some((a) => a.toLowerCase() !== connectedEvm?.toLowerCase()) || wallets.stellar.some((a) => a !== stellar)
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap text-[11px] text-text-muted">
      <p className="min-w-0 max-w-2xl">
        {parts.length > 0 && `Looked on chain ${elapsed(last, now)} ago for ${parts.join(', and for ')}.`}
        {reading.length > 0 && `${parts.length > 0 ? ' ' : ''}Reading ${reading.join(', ')} for transfers that have not arrived.`}
        {partial.length > 0 &&
          ` ${partial.join(', ')} could not be read in full just now; an older transfer is finished from its burn hash below.`}
        {notConnected && ' A wallet that bridged from this browser is searched even when it is not connected.'}
        {wallets.evm.length === 0 && ' A transfer into Stellar shows up once the EVM wallet that sent it is connected.'}
      </p>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(SEARCH_EVENT))}
        className="shrink-0 text-primary hover:underline"
      >
        Search again
      </button>
    </div>
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
