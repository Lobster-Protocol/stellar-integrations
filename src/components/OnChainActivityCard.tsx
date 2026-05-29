import { useAccountOperations } from '../integrations/horizon/account'
import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import LiveDataMeta from './LiveDataMeta'
import { stellarExplorer } from '../utils/format'

export default function OnChainActivityCard({ limit = 5 }: { limit?: number }) {
  const { address } = useWallet()
  const { network } = useNetwork()
  const operations = useAccountOperations(network, address, limit)

  if (!address) return null

  return (
    <div className="rounded-3xl p-5 bg-bg-card card">
      <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-text">Recent on-chain operations</h3>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-text-muted">live · Horizon · {network}</span>
          <LiveDataMeta
            dataUpdatedAt={operations.dataUpdatedAt}
            isFetching={operations.isFetching}
            onRefresh={() => operations.refetch()}
          />
        </div>
      </div>

      {operations.isLoading ? (
        <p className="text-xs text-text-muted">Loading...</p>
      ) : operations.isError ? (
        <p className="text-xs text-coral">
          Read failed: {operations.error?.message}
        </p>
      ) : !operations.data || operations.data.length === 0 ? (
        <p className="text-xs text-text-secondary">
          Nothing on this account yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {operations.data.map((op) => (
            <li
              key={op.id}
              className="px-3 py-2 rounded-xl bg-bg flex items-center justify-between gap-3 text-xs"
            >
              <div className="min-w-0">
                <div className="text-text font-medium">{op.type.replace(/_/g, ' ')}</div>
                <div className="text-[10px] text-text-muted">{new Date(op.createdAt).toLocaleString()}</div>
              </div>
              <a
                href={stellarExplorer(network, 'tx', op.transactionHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[10px] text-primary hover:underline shrink-0"
              >
                {op.transactionHash.slice(0, 8)}...{op.transactionHash.slice(-6)} ↗
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
