import { useState, lazy, Suspense } from 'react'
import { Link } from 'react-router-dom'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'

import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useAccountBalances } from '../integrations/horizon/account'
import { useLobsterPositions } from '../integrations/lobster/hooks'
import { useXlmUsd, valueBalances } from '../integrations/pricing/price'
import { useRecordNav } from '../integrations/pricing/nav'
import { formatUSD, formatBalance, shortenAddress, stellarExplorer } from '../utils/format'
import lobsterIcon from '../assets/lobster-icon.png'
import LiveDataMeta from '../components/LiveDataMeta'
import Hint from '../components/Hint'

// lazy: the Allbridge SDK in DepositModal drags in viem/walletconnect/solana
const DepositModal = lazy(() => import('../components/DepositModal'))
const SwapModal = lazy(() => import('../components/SwapModal'))

const ASSET_COLORS = ['#3693fb', '#ff8770', '#9333ea', '#10b981', '#f97316']

export default function Overview() {
  const { address, connect, connecting } = useWallet()
  const { network } = useNetwork()
  const [depositOpen, setDepositOpen] = useState(false)
  const [swapOpen, setSwapOpen] = useState(false)

  const balancesQ = useAccountBalances(network, address)
  const positionsQ = useLobsterPositions(network, address)
  const priceQ = useXlmUsd(network)

  const valued = valueBalances(balancesQ.data ?? [], priceQ.data ?? null)
  useRecordNav(network, address, valued.usdTotal)

  if (!address) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] gap-5">
        <img src={lobsterIcon} alt="" className="w-20 h-20 opacity-70" />
        <h2 className="text-xl font-semibold text-text">Connect your wallet to get started</h2>
        <p className="text-text-secondary text-sm max-w-sm text-center">
          Deposit funds and let Lobster optimize your liquidity positions across Stellar DEXs.
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

  const balances = balancesQ.data ?? []
  const held = balances.filter((b) => Number(b.balance) > 0)
  const { lines, usdTotal } = valued
  const xlm = balances.find((b) => b.isNative)
  const positions = positionsQ.data ?? []

  // allocation by USD where we have a price, otherwise by raw amount
  const alloc = lines
    .filter((l) => Number(l.balance) > 0)
    .map((l) => ({ name: l.code, value: l.usd ?? Number(l.balance) }))

  const portfolio =
    usdTotal != null
      ? formatUSD(usdTotal)
      : xlm
        ? `${formatBalance(xlm.balance)} XLM`
        : '0'

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <DepositModal open={depositOpen} onClose={() => setDepositOpen(false)} />
        <SwapModal open={swapOpen} onClose={() => setSwapOpen(false)} />
      </Suspense>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text">Portfolio</h2>
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Portfolio Value" value={portfolio} />
        <KPICard
          label="XLM Price"
          value={priceQ.data != null ? `$${priceQ.data.toFixed(4)}` : 'n/a'}
          hint={network === 'mainnet' ? 'Live quote from Stellar Broker (XLM to USDC).' : 'No market price on testnet.'}
        />
        <KPICard label="Assets Held" value={held.length.toString()} />
        <KPICard label="Open Positions" value={positions.length.toString()} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-bg-card rounded-3xl p-5 card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-text">Balances</h3>
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
            <p className="text-sm text-text-muted">No assets in this wallet on {network}.</p>
          ) : (
            <div className="divide-y divide-border">
              {lines
                .filter((l) => Number(l.balance) > 0)
                .map((l) => (
                  <div key={l.code + (l.issuer ?? '')} className="flex items-center justify-between py-2.5 text-sm">
                    <span className="font-medium text-text">{l.code}</span>
                    <div className="text-right">
                      <div className="font-mono text-text">{formatBalance(l.balance)}</div>
                      {l.usd != null && <div className="text-xs text-text-muted">{formatUSD(l.usd)}</div>}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="bg-bg-card rounded-3xl p-5 card">
          <h3 className="text-sm font-semibold text-text mb-4">Token Allocation</h3>
          {alloc.length === 0 ? (
            <p className="text-sm text-text-muted">Nothing held yet.</p>
          ) : (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={120} height={120}>
                <PieChart>
                  <Pie data={alloc} innerRadius={35} outerRadius={55} paddingAngle={3} dataKey="value" stroke="none">
                    {alloc.map((_, i) => (
                      <Cell key={i} fill={ASSET_COLORS[i % ASSET_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2">
                {alloc.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-2 text-sm">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: ASSET_COLORS[i % ASSET_COLORS.length] }} />
                    <span className="text-text-secondary">{d.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-bg-card rounded-3xl p-5 card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text">
            <Hint label="Active Positions" text="Lobster vaults this wallet owns, read live from the on-chain factory." />
          </h3>
          <Link to="/positions" className="text-xs text-primary hover:underline">
            View all
          </Link>
        </div>
        {positionsQ.isLoading ? (
          <p className="text-sm text-text-muted">Loading positions...</p>
        ) : positionsQ.isError ? (
          <button onClick={() => positionsQ.refetch()} className="text-sm text-coral underline">
            Could not load positions. Try again.
          </button>
        ) : positions.length === 0 ? (
          <p className="text-sm text-text-muted">
            No open position on {network}. Lobster positions are created on the network where the factory is deployed.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {positions.map((p) => (
              <div key={p.lobsterAddress} className="flex items-center justify-between py-2.5 text-sm">
                <a
                  href={stellarExplorer(network, 'contract', p.lobsterAddress)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-primary hover:underline"
                >
                  {shortenAddress(p.lobsterAddress)}
                </a>
                <span className="font-mono text-xs text-text-muted">
                  {shortenAddress(p.token0)} / {shortenAddress(p.token1)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function KPICard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div
      className="rounded-3xl p-5"
      style={{
        background: 'linear-gradient(135deg, rgba(54, 147, 251, 0.12), rgba(255, 135, 112, 0.08))',
        border: '1px solid rgba(13, 45, 76, 0.06)',
      }}
    >
      <p className="text-text-secondary text-xs uppercase tracking-wider mb-1.5 font-medium">
        {hint ? <Hint label={label} text={hint} align="center" /> : label}
      </p>
      <p className="text-xl font-bold" style={{ color: '#080a0c', fontFamily: 'Outfit' }}>{value}</p>
    </div>
  )
}
