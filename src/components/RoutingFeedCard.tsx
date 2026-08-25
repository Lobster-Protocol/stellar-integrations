import { routeAssetsLabel } from '../integrations/broker/routing-log'
import { useRoutingLog } from '../integrations/broker/use-routing-log'
import { useNetwork } from '../contexts/NetworkContext'
import { stellarExplorer, formatRelativeAgo } from '../utils/format'
import { Card, CardHead, Empty } from './ui'

// `bare` drops the card chrome so this can sit inside another card's disclosure
export default function RoutingFeedCard({ bare = false }: { bare?: boolean }) {
  const { network } = useNetwork()
  const entries = useRoutingLog()

  const body =
    entries.length === 0 ? (
      <Empty>No swap routed from this browser yet. Open the swap panel from Overview to try one.</Empty>
    ) : (
      <ul className="divide-y divide-border">
        {entries.slice(0, 10).map((e, i) => (
          <li key={`${e.ts}-${i}`} className="py-2 text-xs flex items-center justify-between gap-3">
            <span className="text-text truncate">{routeAssetsLabel(e)}</span>
            <span className="flex items-center gap-3 shrink-0">
              <span className={e.path === 'broker' ? 'text-primary' : 'text-text-secondary'}>
                {e.path === 'broker' ? 'broker' : 'direct'}
              </span>
              <span className="text-text-muted">{formatRelativeAgo({ ms: e.ts })}</span>
              {e.txHash && (
                <a
                  href={stellarExplorer(e.network, 'tx', e.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  view
                </a>
              )}
            </span>
          </li>
        ))}
      </ul>
    )

  if (bare) return body

  return (
    <Card>
      <CardHead
        title="Routing decisions"
        note="Which exchange each swap went through. Recorded per browser, not an on-chain record."
        meta={<span className="text-xs text-text-muted">{entries.length} on {network}</span>}
      />
      {body}
    </Card>
  )
}
