import { useEffect, useState } from 'react'

import { useNetwork } from '../contexts/NetworkContext'
import { CONTRACTS } from '../config/contracts'
import { getRoutingHealth } from '../integrations/routing/health'
import { readRoutingLog, type RoutingEntry } from '../integrations/broker/routing-log'
import { formatRelativeAgo } from '../utils/format'

const PROTOCOLS = ['Stellar Broker', 'Soroswap', 'Aquarius', 'Phoenix', 'SDEX'] as const

export default function RoutingEngineCard() {
  const { network } = useNetwork()
  const c = CONTRACTS[network]
  const [lastRoute, setLastRoute] = useState<RoutingEntry | null>(() => readRoutingLog()[0] ?? null)

  useEffect(() => {
    const sync = () => setLastRoute(readRoutingLog()[0] ?? null)
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'lob_routing_log') sync()
    }
    window.addEventListener('storage', onStorage)
    const interval = setInterval(sync, 5_000)
    return () => {
      window.removeEventListener('storage', onStorage)
      clearInterval(interval)
    }
  }, [])

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
            <span className="text-text">{health.brokerQuoteEnabled ? 'best execution live' : 'offline'}</span>
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
            <span className="text-text">
              {lastRoute.sellingAmount} {lastRoute.sellingAsset.split('-')[0].toUpperCase()} {' → '}
              {lastRoute.buyingAmount ?? '?'} {lastRoute.buyingAsset.split('-')[0].toUpperCase()}
            </span>
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
