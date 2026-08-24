import { useNetwork } from '../contexts/NetworkContext'
import { getRoutingHealth } from '../integrations/routing/health'
import { routeAssetsLabel } from '../integrations/broker/routing-log'
import { useRoutingLog } from '../integrations/broker/use-routing-log'
import { formatRelativeAgo } from '../utils/format'

const PROTOCOLS = ['Stellar Broker', 'Soroswap', 'Aquarius', 'Phoenix', 'SDEX'] as const

// `bare` drops the outer card so this can sit inside another card's disclosure
export default function RoutingEngineCard({ bare = false }: { bare?: boolean }) {
  const { network } = useNetwork()
  const lastRoute = useRoutingLog()[0] ?? null
  const health = getRoutingHealth(network)

  // config/env state, not a live probe. green = enabled on this network.
  const brokerStatus = health.brokerQuoteEnabled
    ? 'enabled'
    : network === 'mainnet'
      ? 'not configured'
      : 'mainnet only'

  const body = (
    <>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text">Routing engine</h3>
        <span className="text-xs text-text-muted">{network}</span>
      </div>

      <p className="text-xs text-text-secondary mb-3">
        {network === 'mainnet'
          ? 'Swaps try Stellar Broker first. It searches Stellar DEX liquidity for the best-priced route across the venues below and submits the legs together. If the broker has no path, no key, or is unreachable, the Soroswap router is called directly as the fallback.'
          : 'Stellar Broker runs on mainnet, so on testnet swaps go straight to the Soroswap router. The venues below are what the broker aggregates on mainnet.'}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-2xl bg-bg p-3 text-xs">
          <div className="text-text-muted mb-1">Broker</div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                health.brokerQuoteEnabled ? 'bg-green' : 'bg-text-muted/40'
              }`}
            />
            <span className="text-text">{brokerStatus}</span>
          </div>
          <div className="text-text-muted mt-1">best-execution aggregator</div>
          <div className="text-text-muted mt-1 truncate">{health.brokerEndpoint}</div>
        </div>

        <div className="rounded-2xl bg-bg p-3 text-xs">
          <div className="text-text-muted mb-1">Direct DEX fallback</div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                health.fallbackEnabled ? 'bg-green' : 'bg-text-muted/40'
              }`}
            />
            <span className="text-text">Soroswap router</span>
          </div>
          <div className="text-text-muted mt-1">{health.fallbackEnabled ? 'configured' : 'not configured'}</div>
        </div>
      </div>

      <div className="mt-3">
        <div className="text-text-muted text-xs mb-1">Venues the broker aggregates</div>
        <div className="flex flex-wrap gap-1">
          {PROTOCOLS.map((p) => (
            <span key={p} className="px-2 py-1 rounded-full bg-bg text-text-secondary text-xs">
              {p}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3 rounded-2xl bg-bg p-3 text-xs">
        <div className="text-text-muted mb-1">Last route</div>
        {lastRoute ? (
          <div className="flex items-center justify-between gap-2 font-mono">
            <span className="text-text">{routeAssetsLabel(lastRoute)}</span>
            <span className={lastRoute.path === 'broker' ? 'text-primary' : 'text-text-secondary'}>
              {lastRoute.path}
            </span>
            <span className="text-text-muted">{formatRelativeAgo({ ms: lastRoute.ts })}</span>
          </div>
        ) : (
          <div className="text-text-muted">none yet</div>
        )}
      </div>
    </>
  )

  if (bare) return body
  return <div className="rounded-3xl p-5 bg-bg-card card">{body}</div>
}
