import { useState, lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useAccountBalances, useAccountExists } from '../integrations/horizon/account'
import { useXlmPrice, valueBalances, priceUnit, tokenPricer } from '../integrations/pricing/price'
import { buildPortfolio, share } from '../integrations/pricing/portfolio'
import {
  useBalanceHistory,
  valueAtCurrentPrice,
  assetKey,
  densify,
} from '../integrations/pricing/history'
import { useRecordNav } from '../integrations/pricing/nav'
import { useVaultPositions, VENUE_LABEL } from '../integrations/lobster/position'
import { useActivity, KIND_LABEL } from '../integrations/horizon/activity'
import { CONTRACTS, EVM_USDC, EVM_BRIDGEABLE, type EvmChain } from '../config/contracts'
import { formatBalance, formatValue, shortenAddress, stellarExplorer } from '../utils/format'
import { CHART_COLORS, TOOLTIP_STYLE } from '../utils/recharts'
import lobsterIcon from '../assets/lobster-icon.png'
import LiveDataMeta from '../components/LiveDataMeta'
import TokenRef from '../components/TokenRef'
import { Card, CardHead, ChartFrame, Empty, Failed, Stat } from '../components/ui'
import { InfoTip } from '../components/InfoTip'

// lazy: the Allbridge SDK in DepositModal drags in viem/walletconnect/solana
const DepositModal = lazy(() => import('../components/DepositModal'))
const SwapModal = lazy(() => import('../components/SwapModal'))

export default function Overview() {
  const { address, connect, connecting } = useWallet()
  const { network } = useNetwork()
  const missing = useAccountExists(network, address) === 'missing'
  const [depositOpen, setDepositOpen] = useState(false)
  const [swapOpen, setSwapOpen] = useState(false)

  const balancesQ = useAccountBalances(network, address)
  const priceQ = useXlmPrice(network)
  const vaultsQ = useVaultPositions(network, address)
  const historyQ = useBalanceHistory(network, address)
  const activityQ = useActivity(network, address)

  const unit = priceUnit(network)
  const price = priceQ.data ?? null
  const valued = valueBalances(balancesQ.data ?? [], price, network)
  // record the headline figure, so Performance charts the same number the user
  // reads here rather than a wallet-only subset of it
  const recorded = buildPortfolio(
    valued.lines,
    vaultsQ.data ?? [],
    tokenPricer(network, price),
    network,
  )
  useRecordNav(network, address, valued.usdTotal != null ? recorded.total : null)

  if (!address) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-5">
        <img src={lobsterIcon} alt="" className="w-20 h-20 opacity-70" />
        <h2 className="text-xl font-semibold text-text">Connect your wallet to get started</h2>
        <p className="text-text-secondary text-sm max-w-sm text-center">
          Deposit funds and let Lobster optimize your liquidity positions across Stellar exchanges.
        </p>
        <button
          onClick={connect}
          disabled={connecting}
          className="px-6 py-2.5 rounded-full bg-primary hover:bg-primary-dark text-white font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ boxShadow: '0 10px 25px rgba(54, 147, 251, 0.25)' }}
        >
          {connecting ? 'Connecting...' : 'Connect Wallet'}
        </button>
      </div>
    )
  }

  const { lines, usdTotal } = valued
  const held = lines.filter((l) => Number(l.balance) > 0)
  const xlm = lines.find((l) => l.isNative)
  const vaults = vaultsQ.data ?? []
  const priceOf = tokenPricer(network, price)
  // same computation Allocation renders, so the two pages can never disagree
  const portfolio = buildPortfolio(lines, vaults, priceOf, network)
  const alloc = portfolio.byAsset
  // land the deposit modal on a working bridge tab; the stellar-direct path
  // isn't wired, so opening on it would dead-end
  const bridgeChains = (Object.keys(EVM_USDC) as EvmChain[]).filter((c) => EVM_BRIDGEABLE[c])

  // the same reconstruction Performance draws, thinned to a sparkline
  const priceByKey: Record<string, number> = {}
  if (price != null) priceByKey.XLM = price
  const usdcIssuer = CONTRACTS[network].tokens.usdcIssuer
  if (usdcIssuer) priceByKey[assetKey('USDC', usdcIssuer)] = 1
  // dense enough that the cursor finds a value on any day, not just on the days
  // something moved
  const spark = densify(historyQ.data?.points ?? []).map((p) => ({
    ts: p.ts,
    value: valueAtCurrentPrice(p, priceByKey),
  }))
  const sparkChanges = (historyQ.data?.points ?? []).map((p) => ({
    ts: p.ts,
    value: valueAtCurrentPrice(p, priceByKey),
  }))

  const events = (activityQ.data?.pages ?? []).flatMap((p) => p.events)
  const recent = events.slice(0, 5)

  const headline =
    usdTotal != null
      ? formatValue(portfolio.total, unit)
      : xlm
        ? `${formatBalance(xlm.balance)} XLM`
        : formatValue(0, unit)

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <DepositModal open={depositOpen} onClose={() => setDepositOpen(false)} initialChain={bridgeChains[0]} />
        <SwapModal open={swapOpen} onClose={() => setSwapOpen(false)} />
      </Suspense>

      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wider text-text-muted mb-1">Portfolio</p>
          <p className="text-3xl font-bold text-text" style={{ fontFamily: 'Outfit' }}>
            {headline}
          </p>
          <p className="text-xs text-text-secondary mt-1">
            {/* an unpriced total has two different causes, and blaming the
                market when the wallet is simply empty reads as a broken feed */}
            {missing
              ? `Nothing to value until this wallet is funded on ${network}.`
              : usdTotal != null
              ? `Wallet plus vaults, quoted in ${unit === 'USD' ? 'US dollars' : 'testnet USDC'}.`
              : price == null
                ? `No price to quote against on ${network} right now, so this shows the XLM balance.`
                : `Nothing in this wallet can be priced on ${network} yet.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSwapOpen(true)}
            className="px-5 py-2 rounded-full bg-bg-card border border-text-muted/20 text-text text-sm font-semibold hover:bg-bg transition-all"
          >
            Swap
          </button>
          <button
            onClick={() => setDepositOpen(true)}
            className="px-5 py-2 rounded-full bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-all"
            style={{ boxShadow: '0 8px 20px rgba(54, 147, 251, 0.2)' }}
          >
            + Deposit
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="In wallet"
          value={
            held.length === 0
              ? formatValue(0, unit)
              : usdTotal != null
                ? formatValue(usdTotal, unit)
                : 'n/a'
          }
          sub={`${held.length} assets`}
        />
        <Stat
          label={
            <>
              In vaults <InfoTip term="vault" label="a vault" />
            </>
          }
          value={formatValue(portfolio.vaultValue, unit)}
          sub={`${vaults.length} position${vaults.length === 1 ? '' : 's'}`}
          tone="accent"
        />
        <Stat
          label="XLM price"
          value={price != null ? price.toFixed(4) : 'n/a'}
          sub={
            price != null
              ? network === 'mainnet'
                ? 'USDC, via Stellar Broker'
                : 'USDC, via the Soroswap pool'
              : 'no quote right now'
          }
        />
        <Stat
          label={
            <>
              Operations <InfoTip term="operation" label="an operation" />
            </>
          }
          value={String(events.length)}
          sub="signed by this wallet"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHead
            title="Wallet balance over time"
            note="What the wallet itself held, rebuilt from its on-chain history. Swaps and vault deposits leave this line."
            meta={
              <Link to="/performance" className="text-xs text-primary hover:underline">
                Performance
              </Link>
            }
          />
          {spark.length < 2 ? (
            <Empty>Not enough history on {network} yet.</Empty>
          ) : (
            <ChartFrame
              label={`Wallet balance over time, quoted in ${unit}`}
              columns={['Date', `Value (${unit})`]}
              rows={sparkChanges.map((r) => [
                new Date(r.ts).toLocaleDateString('en-GB'),
                formatValue(r.value, unit),
              ])}
            >
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={spark} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="overviewFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.25} />
                    <stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={(v) => new Date(Number(v)).toLocaleDateString('en-GB')}
                  formatter={(v) => [formatValue(Number(v), unit), 'Value']}
                />
                <Area
                  type="stepAfter"
                  dataKey="value"
                  stroke={CHART_COLORS[0]}
                  strokeWidth={2}
                  fill="url(#overviewFill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
            </ChartFrame>
          )}
        </Card>

        <Card>
          <CardHead
            title="Allocation"
            meta={
              <Link to="/allocation" className="text-xs text-primary hover:underline">
                Detail
              </Link>
            }
          />
          {alloc.length === 0 ? (
            <Empty>Nothing held yet.</Empty>
          ) : (
            <>
              <ChartFrame
                label="Share of portfolio value per token"
                columns={['Token', 'Share']}
                rows={alloc.map((d) => [d.name, `${share(d, alloc).toFixed(1)}%`])}
              >
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie
                    data={alloc}
                    innerRadius="60%"
                    outerRadius="88%"
                    paddingAngle={2}
                    dataKey="value"
                    stroke="#fff"
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {alloc.map((d, i) => (
                      <Cell key={d.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v, n) => [
                      `${share({ name: String(n), value: Number(v) }, alloc).toFixed(1)}%`,
                      String(n),
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
              </ChartFrame>
              <ul className="space-y-1.5 mt-3">
                {alloc.map((d, i) => (
                  <li key={d.name} className="flex items-center gap-2 text-sm">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    <span className="text-text-secondary">{d.name}</span>
                    <span className="ml-auto text-text-muted text-xs tabular-nums">
                      {share(d, alloc).toFixed(1)}%
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHead
            title="Balances"
            meta={
              <LiveDataMeta
                dataUpdatedAt={balancesQ.dataUpdatedAt}
                isFetching={balancesQ.isFetching}
                onRefresh={() => balancesQ.refetch()}
              />
            }
          />
          {balancesQ.isLoading ? (
            <p className="text-sm text-text-muted py-4">Loading balances...</p>
          ) : balancesQ.isError ? (
            <Failed what="Couldn't load balances." onRetry={() => balancesQ.refetch()} />
          ) : held.length === 0 ? (
            <Empty>No assets in this wallet on {network}.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {held.map((l) => (
                <li key={l.code + (l.issuer ?? '')} className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-medium text-text">{l.code}</span>
                  <div className="text-right">
                    <div className="font-mono text-text tabular-nums">{formatBalance(l.balance)}</div>
                    {l.usd != null && (
                      <div className="text-xs text-text-muted">{formatValue(l.usd, unit)}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHead
            title="Recent activity"
            meta={
              <Link to="/activity" className="text-xs text-primary hover:underline">
                See all
              </Link>
            }
          />
          {activityQ.isLoading ? (
            <p className="text-sm text-text-muted py-4">Loading activity...</p>
          ) : recent.length === 0 ? (
            <Empty>Nothing on this account yet.</Empty>
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <div className="text-text">{KIND_LABEL[e.kind]}</div>
                    {e.moves.length > 0 && (
                      <div className="text-xs text-text-muted">
                        {e.moves
                          .map((m) => `${m.direction === 'in' ? '+' : '-'}${formatBalance(m.amount)} ${m.code}`)
                          .join('  ')}
                      </div>
                    )}
                  </div>
                  <a
                    href={stellarExplorer(network, 'tx', e.txHash)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-text-muted hover:text-primary shrink-0"
                  >
                    {new Date(e.at).toLocaleDateString('en-GB')}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <CardHead
          title="Positions"
          note="Lobster vaults this wallet owns, with what each one currently holds."
          meta={
            <Link to="/positions" className="text-xs text-primary hover:underline">
              Manage
            </Link>
          }
        />
        {vaultsQ.isLoading ? (
          <p className="text-sm text-text-muted py-4">Loading positions...</p>
        ) : vaultsQ.isError ? (
          <Failed what="Couldn't read the vaults." onRetry={() => vaultsQ.refetch()} />
        ) : vaults.length === 0 ? (
          <Empty>
            No open position on {network}. Lobster positions are created on the network where the
            factory is deployed.
          </Empty>
        ) : (
          <ul className="divide-y divide-border">
            {vaults.map((v) => {
              const { value, partial } = portfolio.vaults.find((x) => x.vault.address === v.address)!
              return (
                <li key={v.address} className="flex items-center justify-between gap-3 py-2.5 text-sm flex-wrap">
                  <a
                    href={stellarExplorer(network, 'contract', v.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-primary hover:underline"
                  >
                    {shortenAddress(v.address)}
                  </a>
                  <span className="text-xs text-text-secondary flex items-center gap-1">
                    <TokenRef id={v.token0} /> / <TokenRef id={v.token1} />
                  </span>
                  <span className="text-xs text-text-muted">{VENUE_LABEL[v.venue]}</span>
                  <span className="text-sm text-text tabular-nums">
                    {formatValue(value, unit)}
                    {partial && <span className="text-text-muted"> +</span>}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
