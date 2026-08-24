import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useAccountBalances } from '../integrations/horizon/account'
import {
  useXlmPrice,
  valueBalances,
  priceUnit,
  tokenPricer,
} from '../integrations/pricing/price'
import { useVaultPositions, VENUE_LABEL } from '../integrations/lobster/position'
import { buildPortfolio } from '../integrations/pricing/portfolio'
import { formatBalance, formatValue, shortenAddress } from '../utils/format'
import { CHART_COLORS, TOOLTIP_STYLE } from '../utils/recharts'
import LiveDataMeta from '../components/LiveDataMeta'
import TokenRef from '../components/TokenRef'
import { Card, CardHead, ChartFrame, Empty, Failed, Stat } from '../components/ui'

interface Slice {
  name: string
  value: number
}

function Donut({ data, height = 200, label }: { data: Slice[]; height?: number; label: string }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <ChartFrame
      label={label}
      columns={['Slice', 'Share']}
      rows={data.map((d) => [d.name, `${((d.value / total) * 100).toFixed(1)}%`])}
    >
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          innerRadius="58%"
          outerRadius="86%"
          paddingAngle={2}
          dataKey="value"
          stroke="#fff"
          strokeWidth={2}
          isAnimationActive={false}
        >
          {data.map((d, i) => (
            <Cell key={d.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          formatter={(v, n) => [
            `${((Number(v) / total) * 100).toFixed(1)}%`,
            String(n),
          ]}
        />
      </PieChart>
    </ResponsiveContainer>
    </ChartFrame>
  )
}

function Legend({ data }: { data: Slice[] }) {
  const total = data.reduce((s, d) => s + d.value, 0)
  return (
    <ul className="space-y-1.5">
      {data.map((d, i) => (
        <li key={d.name} className="flex items-center gap-2 text-sm">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
          />
          <span className="text-text-secondary truncate">{d.name}</span>
          <span className="ml-auto text-text tabular-nums text-xs">
            {total > 0 ? ((d.value / total) * 100).toFixed(1) : '0.0'}%
          </span>
        </li>
      ))}
    </ul>
  )
}

export default function Allocation() {
  const { address } = useWallet()
  const { network } = useNetwork()
  const balancesQ = useAccountBalances(network, address)
  const priceQ = useXlmPrice(network)
  const vaultsQ = useVaultPositions(network, address)

  const unit = priceUnit(network)
  const price = priceQ.data ?? null
  const { lines } = valueBalances(balancesQ.data ?? [], price, network)
  const vaults = useMemo(() => vaultsQ.data ?? [], [vaultsQ.data])
  const priceOf = useMemo(() => tokenPricer(network, price), [network, price])

  const held = lines.filter((l) => Number(l.balance) > 0)
  const { walletValue, vaultValue, total, byAsset, byVenue, unpriced, vaults: vaultValues } =
    buildPortfolio(lines, vaults, priceOf, network)

  if (!address) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-text">Allocation</h2>
        <Card>
          <Empty>Connect a wallet to see how its value is spread.</Empty>
        </Card>
      </div>
    )
  }

  if (balancesQ.isError) {
    return (
      <div className="space-y-6">
        <h2 className="text-lg font-semibold text-text">Allocation</h2>
        <Card>
          <Failed what="Couldn't reach Horizon to read balances." onRetry={() => balancesQ.refetch()} />
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-text">Allocation</h2>
          <p className="text-xs text-text-secondary mt-1">
            Everything this wallet controls: loose balances plus what its Lobster vaults hold, and
            which venue each position sits on.
          </p>
        </div>
        <LiveDataMeta
          dataUpdatedAt={balancesQ.dataUpdatedAt}
          isFetching={balancesQ.isFetching || vaultsQ.isFetching}
          onRefresh={() => {
            balancesQ.refetch()
            vaultsQ.refetch()
          }}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="Total value"
          value={total > 0 ? formatValue(total, unit) : 'n/a'}
          sub={unit === 'USDC' ? 'quoted in testnet USDC' : 'wallet plus vaults'}
        />
        <Stat label="In wallet" value={formatValue(walletValue, unit)} sub={`${held.length} assets`} />
        <Stat
          label="In vaults"
          value={formatValue(vaultValue, unit)}
          sub={`${vaults.length} position${vaults.length === 1 ? '' : 's'}`}
          tone="accent"
        />
        <Stat
          label="Unpriced"
          value={String(unpriced.length)}
          sub={unpriced.length ? unpriced.map((l) => l.code).join(', ') : 'everything has a price'}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHead
            title="By asset"
            note="Share of value per token. Tokens with no market pool are left out rather than counted at a made-up price."
          />
          {byAsset.length === 0 ? (
            <Empty>Nothing here can be priced on {network} yet.</Empty>
          ) : (
            <div className="grid grid-cols-[1fr_1fr] items-center gap-4">
              <Donut data={byAsset} label="Share of portfolio value per token" />
              <Legend data={byAsset} />
            </div>
          )}
        </Card>

        <Card>
          <CardHead
            title="By venue"
            note="Where that value actually sits. A vault shows as held until its liquidity is deployed to a DEX."
          />
          {byVenue.length === 0 ? (
            <Empty>No priced value to place yet.</Empty>
          ) : (
            <div className="grid grid-cols-[1fr_1fr] items-center gap-4">
              <Donut data={byVenue} label="Share of portfolio value per venue" />
              <Legend data={byVenue} />
            </div>
          )}
        </Card>
      </div>

      <Card>
        <CardHead
          title="Wallet holdings"
          meta={
            <Link to="/positions" className="text-xs text-primary hover:underline">
              Positions
            </Link>
          }
        />
        {held.length === 0 ? (
          <Empty>No assets in this wallet on {network}.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {held.map((l) => (
              <li key={l.code + (l.issuer ?? '')} className="flex items-center justify-between py-2.5 text-sm">
                <span className="font-medium text-text">{l.code}</span>
                <div className="text-right">
                  <div className="font-mono text-text tabular-nums">{formatBalance(l.balance)}</div>
                  <div className="text-xs text-text-muted">
                    {l.usd != null ? formatValue(l.usd, unit) : 'no market price'}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHead
          title="Vault positions"
          note="Each Lobster vault, what it holds leg by leg, and the venue its liquidity is deployed to."
        />
        {vaultsQ.isLoading ? (
          <p className="text-xs text-text-muted py-4">Reading vaults from Soroban RPC...</p>
        ) : vaultsQ.isError ? (
          <Failed what="Couldn't read the vaults." onRetry={() => vaultsQ.refetch()} />
        ) : vaultValues.length === 0 ? (
          <Empty>No Lobster vault owned by this wallet on {network}.</Empty>
        ) : (
          <div className="space-y-2">
            {vaultValues.map(({ vault, value, partial }) => (
              <div key={vault.address} className="rounded-2xl bg-bg px-4 py-3">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
                  <span className="font-mono text-xs text-text" title={vault.address}>
                    {shortenAddress(vault.address, 6)}
                  </span>
                  <span
                    className={
                      vault.venue === 'idle'
                        ? 'text-xs px-2 py-0.5 rounded-full bg-bg-card text-text-muted'
                        : 'text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary'
                    }
                  >
                    {VENUE_LABEL[vault.venue]}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">
                      <TokenRef id={vault.token0} />
                    </div>
                    <div className="text-text tabular-nums">{formatBalance(vault.amount0)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">
                      <TokenRef id={vault.token1} />
                    </div>
                    <div className="text-text tabular-nums">{formatBalance(vault.amount1)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">
                      Value
                    </div>
                    <div className="text-text tabular-nums">
                      {formatValue(value, unit)}
                      {partial && <span className="text-text-muted"> + unpriced</span>}
                    </div>
                  </div>
                </div>
                {!vault.complete && (
                  <p className="text-[11px] text-coral mt-2">
                    This vault reports a deployed position but would not return its pool.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
