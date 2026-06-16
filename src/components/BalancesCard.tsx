import { useAccountBalances } from '../integrations/horizon/account'
import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { shortenAddress, formatBalance } from '../utils/format'
import LiveDataMeta from './LiveDataMeta'

export default function BalancesCard() {
  const { address } = useWallet()
  const { network } = useNetwork()
  const balances = useAccountBalances(network, address)

  if (!address) return null

  // pick the body once, then render the card chrome around it. Nested
  // ternaries were getting hard to scan when we added the empty branch.
  let body
  if (balances.isLoading) {
    body = <p className="text-xs text-text-muted">Loading balances...</p>
  } else if (balances.isError) {
    body = (
      <div className="text-xs space-y-1.5">
        <p className="text-coral">Couldn't reach Horizon to load balances.</p>
        <button onClick={() => balances.refetch()} className="text-primary hover:underline">
          Try again
        </button>
      </div>
    )
  } else if (!balances.data || balances.data.length === 0) {
    body = (
      <p className="text-xs text-text-secondary">
        No balances yet. This account isn't on-chain on {network}.
      </p>
    )
  } else {
    const sorted = balances.data.slice().sort((a, b) => {
      if (a.isNative !== b.isNative) return a.isNative ? -1 : 1
      return a.code.localeCompare(b.code)
    })
    body = (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {sorted.map((b) => (
          <div key={`${b.code}|${b.issuer ?? 'native'}`} className="px-3 py-2 rounded-xl bg-bg">
            <div className="text-[10px] uppercase tracking-wider text-text-muted">{b.code}</div>
            <div className="text-sm text-text font-medium">{formatBalance(b.balance)}</div>
            {b.issuer && (
              <div className="text-[10px] text-text-muted font-mono mt-0.5">
                {shortenAddress(b.issuer, 4)}
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="rounded-3xl p-5 bg-bg-card card">
      <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <h3 className="text-sm font-semibold text-text">Account balances</h3>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-text-muted">
            {shortenAddress(address, 6)} on {network}
          </span>
          <LiveDataMeta
            dataUpdatedAt={balances.dataUpdatedAt}
            isFetching={balances.isFetching}
            onRefresh={() => balances.refetch()}
          />
        </div>
      </div>
      {body}
    </div>
  )
}
