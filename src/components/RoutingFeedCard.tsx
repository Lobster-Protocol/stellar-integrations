import { useEffect, useState } from 'react'

import { readRoutingLog, type RoutingEntry } from '../integrations/broker/routing-log'
import { useNetwork } from '../contexts/NetworkContext'
import { stellarExplorer, formatRelativeAgo } from '../utils/format'

export default function RoutingFeedCard() {
  const { network } = useNetwork()
  const [entries, setEntries] = useState<RoutingEntry[]>(() => readRoutingLog())

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'lob_routing_log') setEntries(readRoutingLog())
    }
    window.addEventListener('storage', onStorage)
    const interval = setInterval(() => setEntries(readRoutingLog()), 5_000)
    return () => {
      window.removeEventListener('storage', onStorage)
      clearInterval(interval)
    }
  }, [])

  return (
    <div className="rounded-3xl p-5 bg-bg-card card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text">Routing decisions</h3>
        <span className="text-xs text-text-muted">{entries.length}</span>
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-text-muted">
          No swap routed yet. Open the swap modal from Overview to try one.
        </p>
      ) : (
        <ul className="divide-y divide-text-muted/10">
          {entries.slice(0, 10).map((e, i) => (
            <li key={`${e.ts}-${i}`} className="py-2 text-xs flex items-center justify-between gap-2">
              <span className="text-text">
                {e.sellingAmount} {e.sellingAsset.split('-')[0].toUpperCase()} {' → '}
                {e.buyingAmount ?? '?'} {e.buyingAsset.split('-')[0].toUpperCase()}
              </span>
              <span className={e.path === 'broker' ? 'text-primary' : 'text-text-secondary'}>
                {e.path}
              </span>
              <span className="text-text-muted">{formatRelativeAgo({ ms: e.ts })}</span>
              {e.txHash && (
                <a
                  href={stellarExplorer(network, 'tx', e.txHash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-mono"
                >
                  view
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
