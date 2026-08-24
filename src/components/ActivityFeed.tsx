import { useMemo, useState } from 'react'
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
  Shield,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'

import { useNetwork } from '../contexts/NetworkContext'
import { useWallet } from '../contexts/WalletContext'
import {
  useActivity,
  KIND_LABEL,
  KIND_GROUPS,
  groupOf,
  type ActivityEvent,
  type ActivityKind,
  type KindGroup,
} from '../integrations/horizon/activity'
import { protocolLabel } from '../integrations/stellar/token-registry'
import { formatBalance, shortenAddress, stellarExplorer, cn } from '../utils/format'
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
      </div>

      <div className="shrink-0 text-right">
        <div className="text-xs text-text-muted tabular-nums">{time}</div>
        <a
          href={stellarExplorer(network, 'tx', e.txHash)}
          target="_blank"
          rel="noopener noreferrer"
          title={e.fn ? `${e.fn}()` : e.txHash}
          className="text-[10px] font-mono text-primary hover:underline"
        >
          {shortenAddress(e.txHash, 6, 4)}
        </a>
      </div>
    </li>
  )
}

export default function ActivityFeed() {
  const { address } = useWallet()
  const { network } = useNetwork()
  const [filter, setFilter] = useState<KindGroup | 'all'>('all')
  const q = useActivity(network, address)

  const events = useMemo(
    () => (q.data?.pages ?? []).flatMap((p) => p.events),
    [q.data],
  )

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: events.length }
    for (const e of events) {
      const g = groupOf(e.kind)
      c[g] = (c[g] ?? 0) + 1
    }
    return c
  }, [events])

  const shown = filter === 'all' ? events : events.filter((e) => groupOf(e.kind) === filter)

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
    body = <p className="text-xs text-text-muted py-4">Reading the ledger...</p>
  } else if (q.isError) {
    body = <Failed what="Couldn't reach Horizon to read this account." onRetry={() => q.refetch()} />
  } else if (events.length === 0) {
    body = <Empty>Nothing on this account yet on {network}.</Empty>
  } else {
    body = (
      <>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {(['all', ...Object.keys(KIND_GROUPS)] as Array<KindGroup | 'all'>).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setFilter(g)}
              disabled={g !== 'all' && !counts[g]}
              className={cn(
                'px-2.5 py-1 rounded-full text-xs transition-colors disabled:opacity-30',
                filter === g
                  ? 'bg-primary text-white'
                  : 'bg-bg text-text-secondary hover:text-text',
              )}
            >
              {GROUP_LABEL[g]} {counts[g] ?? 0}
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <Empty>Nothing in this category yet.</Empty>
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
        note="Every operation this wallet signed, named from what the transaction actually called."
        meta={<span className="text-[11px] text-text-muted">live | Horizon | {network}</span>}
      />
      {body}
    </Card>
  )
}
