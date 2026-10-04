import { Link, useLocation } from 'react-router-dom'

import { useNetwork } from '../contexts/NetworkContext'
import { cn, shortenAddress } from '../utils/format'
import {
  directionOf,
  orphanIntents,
  useBurnIntents,
  useTrackedTransfers,
  type TrackedTransfer,
} from '../integrations/cctp/transfers'
import { waitingOn } from '../integrations/cctp/status'
import { Card } from './ui'

// the ones waiting on the person first, then the oldest
function byUrgency(a: TrackedTransfer, b: TrackedTransfer): number {
  const act = Number(waitingOn(b).act) - Number(waitingOn(a).act)
  return act !== 0 ? act : a.createdAt - b.createdAt
}

// Above every page but Bridges, which lists them itself: transfers that left one chain and
// have not reached the other, and burns a closed page asked for and never heard back about,
// until each arrives. A PC switched off mid-transfer comes back to this.
export default function PendingTransfersNotice() {
  const { network } = useNetwork()
  const { pathname } = useLocation()
  const pending = useTrackedTransfers(network).filter((t) => t.stage === 'burned')
  const lost = orphanIntents(useBurnIntents(network))
  if (pathname === '/bridges' || (pending.length === 0 && lost.length === 0)) return null

  const first = [...pending].sort(byUrgency)[0]
  const line = first ? waitingOn(first) : null
  const total = pending.length + lost.length

  return (
    <Card className={cn('mb-4 border', line?.act ? 'border-primary/30' : 'border-text-muted/20')}>
      <div role="status" className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-text">
            {total === 1 ? 'A bridge transfer is on its way' : `${total} bridge transfers are on their way`}
          </h3>
          {line && first && (
            <p className="text-xs text-text-secondary mt-1">
              {line.text}
              {directionOf(first) === 'to-stellar' && <span className="text-text-muted">, to {shortenAddress(first.recipient, 6, 4)}</span>}.
            </p>
          )}
          {lost.length > 0 && (
            <p className="text-xs text-text-secondary mt-1">
              {lost.length === 1
                ? `Looking on ${lost[0].chainName} for the ${lost[0].amount} USDC burn a closed page asked your wallet for.`
                : `Looking on chain for ${lost.length} burns a closed page asked your wallet for.`}
            </p>
          )}
          <p className="text-[11px] text-text-muted mt-1">
            Nothing is lost while it waits: the burn is on chain, and this page finds it again on any device once the wallet that sent it is connected.
          </p>
        </div>
        <Link
          to={first && line?.act ? `/bridges?finish=${encodeURIComponent(first.id)}` : '/bridges'}
          className={cn(
            'shrink-0 px-4 py-1.5 rounded-full text-xs font-semibold',
            line?.act ? 'bg-primary text-white' : 'bg-primary/10 text-primary',
          )}
        >
          {line?.act ? 'Finish' : total === 1 ? 'See it' : 'See them'}
        </Link>
      </div>
    </Card>
  )
}
