import { useNetwork } from '../contexts/NetworkContext'
import { getRoutingHealth } from '../integrations/routing/health'
import { routeAssetsLabel } from '../integrations/broker/routing-log'
import { useRoutingLog } from '../integrations/broker/use-routing-log'
import { formatRelativeAgo } from '../utils/format'
import { InfoTip } from './InfoTip'

const PROTOCOLS = ['Stellar Broker', 'Soroswap', 'Aquarius', 'Phoenix', 'Stellar DEX'] as const

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
        <h3 className="text-sm font-semibold text-text flex items-center gap-1.5">
          Routing engine
          <InfoTip label="the routing engine">
            Where your swap gets sent. Lobster checks several exchanges and picks the one that
            gives you the best price.
          </InfoTip>
        </h3>
        <span className="text-xs text-text-muted">{network}</span>
      </div>

      <p className="text-xs text-text-secondary mb-3">
        {network === 'mainnet'
          ? 'Swaps try Stellar Broker first. It looks across the exchanges below for the best-priced route and sends the steps together. If the broker cannot find a route or is unavailable, the swap goes straight to Soroswap instead.'
          : 'Stellar Broker runs on mainnet, so on testnet swaps go straight to Soroswap. The exchanges below are what the broker compares on mainnet.'}
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
          <div className="text-text-muted mt-1">compares exchanges for the best price</div>
          <div className="text-text-muted mt-1 truncate">{health.brokerEndpoint}</div>
        </div>

        <div className="rounded-2xl bg-bg p-3 text-xs">
          <div className="text-text-muted mb-1">Direct exchange</div>
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
        <div className="text-text-muted text-xs mb-1">Exchanges it compares</div>
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
