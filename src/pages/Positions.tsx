import { useReducer, useState } from 'react'

import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useFactoryInfo } from '../integrations/lobster/hooks'
import { isVaultEmpty, lastMoveByVault, useVaultPositions } from '../integrations/lobster/position'
import { useActivity } from '../integrations/horizon/activity'
import {
  hiddenVaults,
  hideVault,
  hideVaults,
  partitionHidden,
  showAllVaults,
} from '../integrations/lobster/hidden-vaults'
import { useAccountBalances } from '../integrations/horizon/account'
import { useXlmPrice, valueBalances, priceUnit, tokenPricer } from '../integrations/pricing/price'
import { buildPortfolio } from '../integrations/pricing/portfolio'
import { CONTRACTS } from '../config/contracts'
import { formatValue, shortenAddress, stellarExplorer } from '../utils/format'
import SignDemoTx from '../components/SignDemoTx'
import LiveDataMeta from '../components/LiveDataMeta'
import RoutingEngineCard from '../components/RoutingEngineCard'
import TtlCountdownCard from '../components/TtlCountdownCard'
import { Card, Empty, Failed, Stat } from '../components/ui'
import { InfoTip } from '../components/InfoTip'
import VaultActionModal from '../components/VaultActionModal'
import VaultCard from '../components/VaultCard'
import CreateVaultModal from '../components/CreateVaultModal'
import type { VaultAction } from '../integrations/lobster/vault-tx'
import type { VaultPosition } from '../integrations/lobster/position'

// how many vault cards a page shows before it asks
const LIST_LIMIT = 6

export default function Positions() {
  const { address } = useWallet()
  const { network } = useNetwork()
  const [vaultAction, setVaultAction] = useState<{ vault: VaultPosition; action: VaultAction } | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  // hiding writes straight to localStorage, so a counter is all it takes to
  // read the list back after a change
  const [, refreshHidden] = useReducer((n: number) => n + 1, 0)
  // a wallet with many vaults gets the biggest few and asks for the rest
  const [showAll, setShowAll] = useState(false)

  const factoryInfo = useFactoryInfo(network, address || undefined)
  const vaultsQ = useVaultPositions(network, address)
  const activityQ = useActivity(network, address)
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

  const hidden = address ? hiddenVaults(network, address) : []
  // biggest first, and a vault holding nothing sinks below one that does even
  // when neither can be priced
  const ordered = [...portfolio.vaults].sort((a, b) => {
    const ea = isVaultEmpty(a.vault)
    const eb = isVaultEmpty(b.vault)
    if (ea !== eb) return ea ? 1 : -1
    if (b.value !== a.value) return b.value - a.value
    return a.vault.address.localeCompare(b.vault.address)
  })
  const split = partitionHidden(ordered, hidden, (p) => p.vault.address)
  const totalValue = portfolio.vaults.reduce((sum, p) => sum + p.value, 0)
  const emptyOnes = split.visible.filter((p) => isVaultEmpty(p.vault))
  const listed = showAll ? split.visible : split.visible.slice(0, LIST_LIMIT)
  const lastMoves = lastMoveByVault(
    (activityQ.data?.pages ?? []).flatMap((p) => p.events),
  )

  return (
    <div className="space-y-6">
      {vaultAction && address && (
        <VaultActionModal
          open
          onClose={() => setVaultAction(null)}
          onDone={() => vaultsQ.refetch()}
          network={network}
          caller={address}
          vault={vaultAction.vault}
          action={vaultAction.action}
        />
      )}

      {createOpen && address && (
        <CreateVaultModal
          open
          onClose={() => setCreateOpen(false)}
          onDone={() => vaultsQ.refetch()}
          network={network}
          caller={address}
        />
      )}

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-text">Positions</h2>
          <p className="text-xs text-text-secondary mt-1">
            Each Lobster vault <InfoTip term="vault" label="a vault" /> is a contract you own. It
            holds your two tokens and can put them to work on Soroswap, Phoenix or Aquarius.
          </p>
        </div>
        {address && (
          <div className="flex items-center gap-3">
            {factoryId && (
              <button
                onClick={() => setCreateOpen(true)}
                className="px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-all"
              >
                + Create vault
              </button>
            )}
            <LiveDataMeta
              dataUpdatedAt={vaultsQ.dataUpdatedAt}
              isFetching={vaultsQ.isFetching}
              onRefresh={() => vaultsQ.refetch()}
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label={
            <>
              Vaults <InfoTip term="vault" label="a vault" />
            </>
          }
          value={address ? String(vaults.length) : '-'}
          sub="owned by this wallet"
        />
        <Stat
          label="Value held"
          value={address ? formatValue(portfolio.vaultValue, unit) : '-'}
          sub={unit === 'USDC' ? 'quoted in testnet USDC' : undefined}
          tone="accent"
        />
        <Stat
          label="Active on an exchange"
          value={address ? `${deployed} of ${vaults.length}` : '-'}
          sub={vaults.length > 0 && deployed === 0 ? 'the rest sit in the vault' : undefined}
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
              factoryId ? (
                <button
                  onClick={() => setCreateOpen(true)}
                  className="px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-all"
                >
                  + Create your first vault
                </button>
              ) : undefined
            }
          >
            Nothing registered yet for {shortenAddress(address)}.
          </Empty>
        </Card>
      ) : (
        <div className="space-y-4">
          {(emptyOnes.length > 0 || split.visible.length > LIST_LIMIT) && (
            <div className="flex items-center gap-4 flex-wrap text-xs text-text-secondary">
              <span>
                {split.visible.length} vault{split.visible.length === 1 ? '' : 's'}, biggest first
              </span>
              {emptyOnes.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    hideVaults(
                      network,
                      address,
                      emptyOnes.map((p) => p.vault.address),
                    )
                    refreshHidden()
                  }}
                  className="text-primary hover:underline"
                >
                  Tidy away the {emptyOnes.length} empty one{emptyOnes.length === 1 ? '' : 's'}
                </button>
              )}
            </div>
          )}

          {/* items-start: an open detail must not stretch the card beside it */}
          <div className="grid lg:grid-cols-2 gap-4 items-start">
            {listed.map(({ vault: v, value, partial }) => (
              <VaultCard
                key={v.address}
                vault={v}
                value={value}
                partial={partial}
                unit={unit}
                network={network}
                account={address}
                priceOf={priceOf}
                share={totalValue > 0 ? (value / totalValue) * 100 : 0}
                lastMove={lastMoves.get(v.address)}
                onAction={(action) => setVaultAction({ vault: v, action })}
                onHide={() => {
                  hideVault(network, address, v.address)
                  refreshHidden()
                }}
              />
            ))}
          </div>

          {split.visible.length > LIST_LIMIT && (
            <button
              type="button"
              onClick={() => setShowAll(!showAll)}
              className="w-full py-2 rounded-xl bg-bg text-xs text-text-secondary hover:text-text"
            >
              {showAll
                ? `Show the ${LIST_LIMIT} biggest only`
                : `Show all ${split.visible.length} vaults`}
            </button>
          )}

          {split.hidden.length > 0 && (
            <Card>
              <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
                <span className="text-text-secondary">
                  {split.hidden.length} vault{split.hidden.length === 1 ? '' : 's'} hidden in this
                  browser. They are still on-chain and still yours.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    showAllVaults(network, address)
                    refreshHidden()
                  }}
                  className="text-primary hover:underline"
                >
                  Show them again
                </button>
              </div>
            </Card>
          )}

          {split.visible.length === 0 && (
            <Card>
              <Empty>Every vault this wallet owns is hidden in this browser.</Empty>
            </Card>
          )}
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
              copy={factoryId}
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
              copy={factoryInfo.data.admin}
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
