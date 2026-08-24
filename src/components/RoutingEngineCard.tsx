import { useNetwork } from '../contexts/NetworkContext'
import { CONTRACTS } from '../config/contracts'
import { getRoutingHealth } from '../integrations/routing/health'
import { routeAssetsLabel } from '../integrations/broker/routing-log'
import { useRoutingLog } from '../integrations/broker/use-routing-log'
import { formatRelativeAgo } from '../utils/format'

const PROTOCOLS = ['Stellar Broker', 'Soroswap', 'Aquarius', 'Phoenix', 'SDEX'] as const

export default function RoutingEngineCard() {
  const { network } = useNetwork()
  const c = CONTRACTS[network]
  const lastRoute = useRoutingLog()[0] ?? null
  const health = getRoutingHealth(network)
  const aquariusAvailable = !!c.aquarius.router

  return (
    <div className="rounded-3xl p-5 bg-bg-card card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text">Routing engine</h3>
        <span className="text-xs text-text-muted">{network}</span>
      </div>

      <p className="text-xs text-text-secondary mb-3">
        Swaps go through Stellar Broker first. The broker routes across Soroswap, Aquarius,
        Phoenix and the native Stellar SDEX. When the broker has no path or is unreachable, the
        Soroswap router is invoked directly as the safety net.
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
            <span className="text-text">
              {health.brokerQuoteEnabled ? 'best execution live' : network === 'mainnet' ? 'offline' : 'mainnet only'}
            </span>
          </div>
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
            <span className="text-text">{health.fallbackEnabled ? 'soroswap router live' : 'soroswap not configured'}</span>
          </div>
          {aquariusAvailable && (
            <div className="text-text-muted mt-1">aquarius router live</div>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {PROTOCOLS.map((p) => (
          <span
            key={p}
            className="px-2 py-1 rounded-full bg-bg text-text-secondary text-xs"
          >
            {p}
          </span>
        ))}
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
    </div>
  )
}
