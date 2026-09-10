import { useNetwork } from '../contexts/NetworkContext'
import { getRoutingHealth } from '../integrations/routing/health'
import { routeAssetsLabel } from '../integrations/broker/routing-log'
import { useRoutingLog } from '../integrations/broker/use-routing-log'
import { stellarExplorer, formatRelativeAgo } from '../utils/format'
import { Card, CardHead, Empty } from './ui'
import { InfoTip } from './InfoTip'

const PROTOCOLS = ['Stellar Broker', 'Soroswap', 'Aquarius', 'Phoenix', 'Stellar DEX'] as const

// how many recorded routes the list shows before it stops. the log itself keeps
// fifty; past the first handful a reader is reading history, not the routing.
const SHOWN = 10

export default function RoutingEngineCard() {
  const { network } = useNetwork()
  const entries = useRoutingLog()
  const health = getRoutingHealth(network)

  // read off this build's config, never probed. so no green anywhere in the two
  // tiles below: green is for something we measured, and the routes at the
  // bottom are the only measured thing on this card.
  const brokerStatus = health.brokerQuoteEnabled
    ? 'configured'
    : network === 'mainnet'
      ? 'not configured'
      : 'mainnet only'

  return (
    <Card>
      <CardHead
        title={
          <span className="inline-flex items-center gap-1.5">
            Routing engine
            <InfoTip label="the routing engine">
              Where your swap gets sent. Lobster checks several exchanges and picks the one that
              gives you the best price.
            </InfoTip>
          </span>
        }
        note={
          network === 'mainnet'
            ? 'Swaps try Stellar Broker first. It looks across the exchanges below for the best-priced route and sends the steps together. If the broker cannot find a route or is unavailable, the swap goes straight to Soroswap instead.'
            : 'Stellar Broker runs on mainnet, so on testnet swaps go straight to Soroswap. The exchanges below are what the broker compares on mainnet.'
        }
        meta={<span className="text-xs text-text-muted">{network}</span>}
      />

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-bg p-3 text-xs">
          <div className="text-text-muted mb-1">Broker</div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                health.brokerQuoteEnabled ? 'bg-primary/60' : 'bg-text-muted/40'
              }`}
            />
            <span className="text-text">{brokerStatus}</span>
          </div>
          <div className="text-text-muted mt-1">compares exchanges for the best price</div>
          <div className="text-text-muted mt-1 truncate">{health.brokerEndpoint}</div>
        </div>

        <div className="rounded-2xl bg-bg p-3 text-xs">
          <div className="text-text-muted mb-1">Direct exchange</div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                health.fallbackEnabled ? 'bg-primary/60' : 'bg-text-muted/40'
              }`}
            />
            <span className="text-text">Soroswap router</span>
          </div>
          <div className="text-text-muted mt-1">
            {health.fallbackEnabled ? 'router address configured' : 'no router configured'}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-text-muted mt-2">
        Both tiles read the addresses this build was set up with. Neither has been called, so a
        configured route can still turn out to be unavailable at the moment you swap.
      </p>

      <div className="mt-3">
        <div className="text-text-muted text-xs mb-1">Exchanges it compares</div>
        <div className="flex flex-wrap gap-1">
          {PROTOCOLS.map((p) => (
            <span key={p} className="px-2 py-1 rounded-full bg-bg text-text-secondary text-xs">
              {p}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h4 className="text-xs font-semibold text-text">Routes taken</h4>
          <span className="text-xs text-text-muted">
            {entries.length} recorded on {network}
          </span>
        </div>
        <p className="text-xs text-text-secondary mt-1 mb-1">
          Which exchange each swap actually went through, most recent first. Kept in this browser,
          so it is a trace and not an on-chain record.
        </p>
        {entries.length === 0 ? (
          <Empty>
            No swap routed from this browser yet. Connect a wallet, then use the Swap button on the
            Overview page.
          </Empty>
        ) : (
          <ul className="divide-y divide-border">
            {entries.slice(0, SHOWN).map((e, i) => (
              <li
                key={`${e.ts}-${i}`}
                className="py-2 text-xs flex items-center justify-between gap-3"
              >
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
        )}
      </div>
    </Card>
  )
}
