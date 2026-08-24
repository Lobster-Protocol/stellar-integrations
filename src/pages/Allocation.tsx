import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useAccountBalances } from '../integrations/horizon/account'
import { useXlmUsd, valueBalances, allocationWeights } from '../integrations/pricing/price'
import { formatUSD, formatBalance } from '../utils/format'
import { CHART_COLORS } from '../utils/recharts'
import LiveDataMeta from '../components/LiveDataMeta'

// current allocation of the connected wallet, read from Horizon. a wallet has
// no allocation history on-chain, so this is the live snapshot only: USD on
// mainnet, native units on testnet.
export default function Allocation() {
  const { address } = useWallet()
  const { network } = useNetwork()
  const balancesQ = useAccountBalances(network, address)
  const priceQ = useXlmUsd(network)

  if (!address) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-text">Token Allocation</h2>
        <p className="text-sm text-text-muted">Connect a wallet to see its allocation.</p>
      </div>
    )
  }

  const { lines, usdTotal } = valueBalances(balancesQ.data ?? [], priceQ.data ?? null, network)
  const held = lines.filter((l) => Number(l.balance) > 0)
  const chart = allocationWeights(lines)
  const totalWeight = chart.reduce((s, c) => s + c.value, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text">Token Allocation</h2>
        <LiveDataMeta
          dataUpdatedAt={balancesQ.dataUpdatedAt}
          isFetching={balancesQ.isFetching}
          onRefresh={() => balancesQ.refetch()}
        />
      </div>

      {balancesQ.isLoading ? (
        <p className="text-sm text-text-muted">Loading balances...</p>
      ) : balancesQ.isError ? (
        <button onClick={() => balancesQ.refetch()} className="text-sm text-coral underline">
          Could not load balances. Try again.
        </button>
      ) : held.length === 0 ? (
        <p className="text-sm text-text-muted">No assets held in this wallet on {network}.</p>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="bg-bg-card rounded-3xl p-5 card flex items-center justify-center">
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={chart} innerRadius={60} outerRadius={95} paddingAngle={3} dataKey="value" stroke="none">
                  {chart.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-bg-card rounded-3xl p-5 card">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-text">Holdings</h3>
              {usdTotal != null && <span className="text-sm text-text-muted">{formatUSD(usdTotal)}</span>}
            </div>
            <div className="divide-y divide-border">
              {held.map((l, i) => {
                const pct = totalWeight > 0 ? (chart[i].value / totalWeight) * 100 : 0
                return (
                  <div key={l.code + (l.issuer ?? '')} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="font-medium text-text">{l.code}</span>
                    </span>
                    <div className="text-right">
                      <div className="font-mono text-text">
                        {formatBalance(l.balance)}
                        <span className="text-text-muted"> ({pct.toFixed(1)}%)</span>
                      </div>
                      {l.usd != null && <div className="text-xs text-text-muted">{formatUSD(l.usd)}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
