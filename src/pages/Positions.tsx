import { Link } from 'react-router-dom'

import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useFactoryInfo } from '../integrations/lobster/hooks'
import { useVaultPositions, VENUE_LABEL } from '../integrations/lobster/position'
import { useAccountBalances } from '../integrations/horizon/account'
import { useXlmPrice, valueBalances, priceUnit, tokenPricer } from '../integrations/pricing/price'
import { buildPortfolio } from '../integrations/pricing/portfolio'
import { CONTRACTS } from '../config/contracts'
import { formatBalance, formatValue, shortenAddress, stellarExplorer } from '../utils/format'
import SignDemoTx from '../components/SignDemoTx'
import LiveDataMeta from '../components/LiveDataMeta'
import RoutingEngineCard from '../components/RoutingEngineCard'
import TtlCountdownCard from '../components/TtlCountdownCard'
import TokenRef from '../components/TokenRef'
import { Card, Empty, Failed, Stat } from '../components/ui'
import { InfoTip } from '../components/InfoTip'

export default function Positions() {
  const { address } = useWallet()
  const { network } = useNetwork()

  const factoryInfo = useFactoryInfo(network, address || undefined)
  const vaultsQ = useVaultPositions(network, address)
  const balancesQ = useAccountBalances(network, address)
  const priceQ = useXlmPrice(network)

  const unit = priceUnit(network)
  const price = priceQ.data ?? null
  const { lines } = valueBalances(balancesQ.data ?? [], price, network)
  const priceOf = tokenPricer(network, price)
  const vaults = vaultsQ.data ?? []
  const portfolio = buildPortfolio(lines, vaults, priceOf, network)

  const factoryId = CONTRACTS[network].lobster.factory
  const factoryExplorer = factoryId ? stellarExplorer(network, 'contract', factoryId) : null
  const deployed = vaults.filter((v) => v.venue !== 'idle').length

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-text">Positions</h2>
          <p className="text-xs text-text-secondary mt-1">
            Each Lobster vault <InfoTip term="vault" label="a vault" /> is a contract you own. It
            holds your two tokens and can put them to work on Soroswap, Phoenix or Aquarius.
          </p>
        </div>
        {address && (
          <LiveDataMeta
            dataUpdatedAt={vaultsQ.dataUpdatedAt}
            isFetching={vaultsQ.isFetching}
            onRefresh={() => vaultsQ.refetch()}
          />
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label={
            <>
              Vaults <InfoTip term="vault" label="a vault" />
            </>
          }
          value={String(vaults.length)}
          sub="owned by this wallet"
        />
        <Stat
          label="Value held"
          value={formatValue(portfolio.vaultValue, unit)}
          sub={unit === 'USDC' ? 'quoted in testnet USDC' : undefined}
          tone="accent"
        />
        <Stat
          label="Active on an exchange"
          value={`${deployed} of ${vaults.length}`}
          sub={deployed === 0 ? 'the rest sit in the vault' : undefined}
        />
        <Stat
          label={
            <>
              Factory pools <InfoTip term="factory" label="the Factory" />
            </>
          }
          value={factoryInfo.data ? String(factoryInfo.data.poolCount) : '-'}
          sub="created by everyone"
        />
      </div>

      {!address ? (
        <Card>
          <Empty>Connect a wallet to see the vaults it owns.</Empty>
        </Card>
      ) : !factoryId ? (
        <Card>
          <Empty>The Lobster factory is not deployed on {network} yet.</Empty>
        </Card>
      ) : vaultsQ.isLoading ? (
        <Card>
          <p className="text-xs text-text-muted py-4">Loading your vaults...</p>
        </Card>
      ) : vaultsQ.isError ? (
        <Card>
          <Failed what="Couldn't load your vaults." onRetry={() => vaultsQ.refetch()} />
        </Card>
      ) : vaults.length === 0 ? (
        <Card>
          <Empty
            action={
              network === 'testnet' ? (
                <span className="text-xs text-text-muted">
                  Sign a testnet transaction below to try the flow end to end.
                </span>
              ) : undefined
            }
          >
            Nothing registered yet for {shortenAddress(address)}.
          </Empty>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-2 gap-4">
          {portfolio.vaults.map(({ vault: v, value, partial }) => (
            <Card key={v.address}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <a
                    href={stellarExplorer(network, 'contract', v.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={v.address}
                    className="font-mono text-sm text-primary hover:underline"
                  >
                    {shortenAddress(v.address, 6)}
                  </a>
                  <div className="text-xs text-text-secondary mt-0.5 flex items-center gap-1">
                    <TokenRef id={v.token0} /> / <TokenRef id={v.token1} />
                  </div>
                </div>
                <span
                  className={
                    v.venue === 'idle'
                      ? 'text-xs px-2.5 py-1 rounded-full bg-bg text-text-muted shrink-0'
                      : 'text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary shrink-0'
                  }
                >
                  {VENUE_LABEL[v.venue]}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-bg px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">
                    <TokenRef id={v.token0} />
                  </div>
                  <div className="text-sm text-text tabular-nums">{formatBalance(v.amount0)}</div>
                </div>
                <div className="rounded-xl bg-bg px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">
                    <TokenRef id={v.token1} />
                  </div>
                  <div className="text-sm text-text tabular-nums">{formatBalance(v.amount1)}</div>
                </div>
                <div className="rounded-xl bg-bg px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Value</div>
                  <div className="text-sm text-text tabular-nums">
                    {formatValue(value, unit)}
                    {partial && <span className="text-text-muted"> +</span>}
                  </div>
                </div>
              </div>

              {v.venue !== 'idle' && v.poolAddress && (
                <div className="mt-3 text-xs text-text-secondary">
                  Working in{' '}
                  <a
                    href={stellarExplorer(network, 'contract', v.poolAddress)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-primary hover:underline"
                  >
                    {shortenAddress(v.poolAddress)}
                  </a>
                  {v.lpShares && (
                    <span className="text-text-muted"> - {formatBalance(v.lpShares)} pool shares <InfoTip term="lpShares" label="pool shares" /></span>
                  )}
                </div>
              )}

              {!v.complete && (
                <p className="text-xs text-coral mt-3">
                  This vault reports a deployed position but would not return its pool.
                </p>
              )}

              <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(13, 45, 76, 0.06)' }}>
                <Link
                  to="/activity"
                  className="text-xs text-primary hover:underline"
                >
                  Moves that touched this wallet
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <h3 className="text-sm font-semibold text-text">
            Factory contract <InfoTip term="factory" label="the Factory" />
          </h3>
          <div className="flex items-center gap-3">
            <LiveDataMeta
              dataUpdatedAt={factoryInfo.dataUpdatedAt}
              isFetching={factoryInfo.isFetching}
              onRefresh={() => factoryInfo.refetch()}
            />
            {factoryExplorer && (
              <a
                href={factoryExplorer}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-primary hover:underline"
              >
                Stellar Expert
              </a>
            )}
          </div>
        </div>
        {!factoryId ? (
          <p className="text-xs text-text-secondary">Not deployed on {network} yet.</p>
        ) : factoryInfo.isLoading ? (
          <p className="text-xs text-text-muted">Loading...</p>
        ) : factoryInfo.isError ? (
          <Failed what="Couldn't read the factory." onRetry={() => factoryInfo.refetch()} />
        ) : factoryInfo.data ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Stat
              label={
                <>
                  Contract ID <InfoTip term="contractId" label="a contract ID" />
                </>
              }
              value={shortenAddress(factoryId, 8)}
              mono
              href={factoryExplorer ?? undefined}
            />
            <Stat
              label={
                <>
                  Admin <InfoTip term="admin" label="the admin" />
                </>
              }
              value={shortenAddress(factoryInfo.data.admin, 8)}
              mono
              href={stellarExplorer(network, 'account', factoryInfo.data.admin)}
            />
            <Stat label="Pools created" value={String(factoryInfo.data.poolCount)} />
          </div>
        ) : null}
      </Card>

      <TtlCountdownCard />

      <RoutingEngineCard />

      <SignDemoTx />
    </div>
  )
}
