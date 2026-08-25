import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  Boxes,
  Clock,
  Eye,
  Flame,
  Minus,
  Plus,
  Search,
  Shield,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

import { useNetwork } from '../contexts/NetworkContext'
import { useWallet } from '../contexts/WalletContext'
import {
  useActivity,
  matchesQuery,
  KIND_LABEL,
  KIND_GROUPS,
  groupOf,
  type ActivityEvent,
  type ActivityKind,
  type KindGroup,
} from '../integrations/horizon/activity'
import { protocolLabel } from '../integrations/stellar/token-registry'
import { formatBalance, shortenAddress, stellarExplorer, cn } from '../utils/format'
import CopyButton from './CopyButton'
import TokenRef from './TokenRef'
import { Card, CardHead, Empty, Failed } from './ui'

const ICON: Record<ActivityKind, LucideIcon> = {
  swap: ArrowLeftRight,
  'liquidity-add': Plus,
  'liquidity-remove': Minus,
  'position-open': Boxes,
  sent: ArrowUpRight,
  received: ArrowDownLeft,
  mint: Sparkles,
  burn: Flame,
  trustline: Shield,
  'account-funded': ArrowDownLeft,
  'storage-rent': Clock,
  'contract-read': Eye,
  'contract-deploy': Boxes,
  'contract-call': Boxes,
}

const GROUP_LABEL: Record<KindGroup | 'all', string> = {
  all: 'Everything',
  moves: 'Transfers',
  trading: 'Swaps',
  liquidity: 'Liquidity',
  housekeeping: 'Maintenance',
}

// kinds where who was on the other side is the point of the row
const SHOW_COUNTERPARTY: ActivityKind[] = ['sent', 'received', 'mint', 'burn', 'account-funded']

function dayKey(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Row({ e }: { e: ActivityEvent }) {
  const { network } = useNetwork()
  const Icon = ICON[e.kind]
  const via = e.contractId ? protocolLabel(e.contractId, network) : null
  const time = new Date(e.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const other = SHOW_COUNTERPARTY.includes(e.kind)
    ? e.moves.find((m) => m.counterparty)
    : undefined

  return (
    <li className="flex items-center gap-3 py-2.5">
      <span
        className={cn(
          'shrink-0 h-7 w-7 rounded-full flex items-center justify-center',
          e.ok ? 'bg-primary/8 text-primary' : 'bg-coral/10 text-coral',
        )}
      >
        <Icon size={14} />
      </span>

      <div className="min-w-0 flex-1">
        <div className="text-sm text-text flex items-center gap-1.5 flex-wrap">
          <span className="font-medium">{KIND_LABEL[e.kind]}</span>
          {via && <span className="text-text-muted text-xs">on {via}</span>}
          {!e.ok && <span className="text-coral text-xs">failed</span>}
        </div>

        {e.swapPath && (
          <div className="text-xs text-text-secondary flex items-center gap-1 mt-0.5">
            <TokenRef id={e.swapPath[0]} />
            <span className="text-text-muted">to</span>
            <TokenRef id={e.swapPath[1]} />
          </div>
        )}

        {e.moves.length > 0 && (
          <div className="text-xs mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {e.moves.map((m, i) => (
              <span key={i} className={m.direction === 'in' ? 'text-green' : 'text-text-secondary'}>
                {m.direction === 'in' ? '+' : '-'}
                {formatBalance(m.amount)} {m.code}
              </span>
            ))}
          </div>
        )}

        {other?.counterparty && (
          <div className="text-[11px] text-text-muted mt-0.5 flex items-center gap-0.5">
            <span>
              {other.direction === 'out' ? 'to' : 'from'}{' '}
              <span className="font-mono" title={other.counterparty}>
                {shortenAddress(other.counterparty, 6, 4)}
              </span>
            </span>
            <CopyButton value={other.counterparty} what="the address" />
          </div>
        )}
      </div>

      <div className="shrink-0 text-right">
        <div className="text-xs text-text-muted tabular-nums">{time}</div>
        <div className="flex items-center justify-end">
          <a
            href={stellarExplorer(network, 'tx', e.txHash)}
            target="_blank"
            rel="noopener noreferrer"
            title={e.fn ? `${e.fn}()` : e.txHash}
            className="text-[10px] font-mono text-primary hover:underline"
          >
            {shortenAddress(e.txHash, 6, 4)}
          </a>
          <CopyButton value={e.txHash} what="the transaction hash" />
        </div>
      </div>
    </li>
  )
}

export default function ActivityFeed() {
  const { address } = useWallet()
  const { network } = useNetwork()
  const q = useActivity(network, address)

  // Filter and search live in the address bar, so a view worth talking about can
  // be sent to somebody as a link.
  const [params, setParams] = useSearchParams()
  const raw = params.get('show')
  const filter: KindGroup | 'all' = raw && raw in GROUP_LABEL ? (raw as KindGroup) : 'all'
  const query = params.get('q') ?? ''

  function update(next: { show?: KindGroup | 'all'; q?: string }) {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (!v || v === 'all') p.delete(k)
      else p.set(k, v)
    }
    setParams(p, { replace: true })
  }

  const events = useMemo(() => (q.data?.pages ?? []).flatMap((p) => p.events), [q.data])
  const found = useMemo(() => events.filter((e) => matchesQuery(e, query)), [events, query])

  // counts follow the search, so a tab never promises rows the search hides
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: found.length }
    for (const e of found) {
      const g = groupOf(e.kind)
      c[g] = (c[g] ?? 0) + 1
    }
    return c
  }, [found])

  const shown = filter === 'all' ? found : found.filter((e) => groupOf(e.kind) === filter)

  // day headers, in the order the events already arrive (newest first)
  const days: Array<[string, ActivityEvent[]]> = []
  for (const e of shown) {
    const k = dayKey(e.at)
    const last = days.at(-1)
    if (last && last[0] === k) last[1].push(e)
    else days.push([k, [e]])
  }

  let body
  if (!address) {
    body = <Empty>Connect a wallet to see what it has done on-chain.</Empty>
  } else if (q.isLoading) {
    body = <p className="text-xs text-text-muted py-4">Loading activity...</p>
  } else if (q.isError) {
    body = <Failed what="Couldn't load this account's activity." onRetry={() => q.refetch()} />
  } else if (events.length === 0) {
    body = <Empty>Nothing on this account yet on {network}.</Empty>
  } else {
    body = (
      <>
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {(['all', ...Object.keys(KIND_GROUPS)] as Array<KindGroup | 'all'>).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => update({ show: g })}
              disabled={g !== 'all' && !counts[g]}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs transition-colors disabled:opacity-30',
                filter === g ? 'bg-primary text-white' : 'bg-bg text-text-secondary hover:text-text',
              )}
            >
              {GROUP_LABEL[g]} {counts[g] ?? 0}
            </button>
          ))}

          <div className="relative ml-auto">
            <Search
              size={12}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(ev) => update({ q: ev.target.value })}
              placeholder="Search asset, address, hash"
              aria-label="Search this account's activity"
              className="w-52 max-w-full pl-7 pr-2.5 py-1 rounded-full bg-bg text-xs text-text placeholder:text-text-muted outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {shown.length === 0 ? (
          <Empty
            action={
              query ? (
                <button
                  type="button"
                  onClick={() => update({ q: '' })}
                  className="text-xs text-primary hover:underline"
                >
                  Clear the search
                </button>
              ) : undefined
            }
          >
            {query
              ? `Nothing loaded so far matches ${query}.`
              : 'Nothing in this category yet.'}
          </Empty>
        ) : (
          days.map(([day, list]) => (
            <div key={day} className="mb-1">
              <div className="text-[10px] uppercase tracking-wider text-text-muted pt-2 pb-1">
                {day}
              </div>
              <ul className="divide-y divide-border">
                {list.map((e) => (
                  <Row key={e.id} e={e} />
                ))}
              </ul>
            </div>
          ))
        )}

        {q.hasNextPage && (
          <button
            type="button"
            onClick={() => q.fetchNextPage()}
            disabled={q.isFetchingNextPage}
            className="mt-3 w-full py-2 rounded-xl bg-bg text-xs text-text-secondary hover:text-text disabled:opacity-40"
          >
            {q.isFetchingNextPage ? 'Loading...' : 'Load older'}
          </button>
        )}
      </>
    )
  }

  return (
    <Card>
      <CardHead
        title="On-chain activity"
        note="Every operation this wallet signed, labelled by what each transaction did."
        meta={<span className="text-[11px] text-text-muted">live | on-chain | {network}</span>}
      />
      {body}
    </Card>
  )
}
