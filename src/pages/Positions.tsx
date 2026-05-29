import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useFactoryInfo, useLobsterPositions } from '../integrations/lobster/hooks'
import { CONTRACTS } from '../config/contracts'
import { shortenAddress, stellarExplorer } from '../utils/format'
import SignDemoTx from '../components/SignDemoTx'
import BalancesCard from '../components/BalancesCard'
import LiveDataMeta from '../components/LiveDataMeta'

export default function Positions() {
  const { address } = useWallet()
  const { network } = useNetwork()

  const factoryInfo = useFactoryInfo(network, address || undefined)
  const positions = useLobsterPositions(network, address)

  const factoryId = CONTRACTS[network].lobster.factory
  const factoryExplorer = factoryId ? stellarExplorer(network, 'contract', factoryId) : null

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text">Lobster Positions</h2>
        <p className="text-xs text-text-secondary mt-1">
          Data read live from {network}.
        </p>
      </div>

      <BalancesCard />

      {/* Factory card - always shown, sources from on-chain state */}
      <div className="rounded-3xl p-5 bg-bg-card card">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h3 className="text-sm font-semibold text-text">Factory contract</h3>
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
                Stellar Expert ↗
              </a>
            )}
          </div>
        </div>

        {!factoryId ? (
          <p className="text-xs text-coral">
            Not deployed on {network} yet.
          </p>
        ) : factoryInfo.isLoading ? (
          <p className="text-xs text-text-muted">Reading from Soroban RPC...</p>
        ) : factoryInfo.isError ? (
          <p className="text-xs text-coral">
            Read failed: {factoryInfo.error?.message}
          </p>
        ) : factoryInfo.data ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <Stat label="Contract ID" value={shortenAddress(factoryId, 8)} mono />
            <Stat label="Admin" value={shortenAddress(factoryInfo.data.admin, 8)} mono />
            <Stat label="Pools created" value={String(factoryInfo.data.poolCount)} />
          </div>
        ) : null}
      </div>

      {/* User positions */}
      <div className="rounded-3xl p-5 bg-bg-card card">
        <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
          <h3 className="text-sm font-semibold text-text">Your positions</h3>
          {address && (
            <LiveDataMeta
              dataUpdatedAt={positions.dataUpdatedAt}
              isFetching={positions.isFetching}
              onRefresh={() => positions.refetch()}
            />
          )}
        </div>

        {!address ? (
          <p className="text-xs text-text-secondary">
            Connect a wallet to see your positions.
          </p>
        ) : positions.isLoading ? (
          <p className="text-xs text-text-muted">Loading positions for {shortenAddress(address)}...</p>
        ) : positions.isError ? (
          <p className="text-xs text-coral">
            Read failed: {positions.error?.message}
          </p>
        ) : !positions.data || positions.data.length === 0 ? (
          <div className="text-xs text-text-secondary">
            Nothing registered yet for{' '}
            <span className="font-mono">{shortenAddress(address)}</span>.
            {network === 'testnet' && (
              <span className="block mt-2">
                Try the button below to send a real signed tx through your wallet.
              </span>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {positions.data.map((p) => {
              const lobsterExplorer = stellarExplorer(network, 'contract', p.lobsterAddress)
              return (
                <div
                  key={p.lobsterAddress}
                  className="px-3 py-2 rounded-xl bg-bg text-xs grid grid-cols-1 sm:grid-cols-4 gap-2"
                >
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Lobster</div>
                    <a
                      href={lobsterExplorer}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline font-medium font-mono"
                    >
                      {shortenAddress(p.lobsterAddress)} ↗
                    </a>
                  </div>
                  <Stat label="Owner" value={shortenAddress(p.owner)} mono />
                  <Stat label="Token0" value={shortenAddress(p.token0)} mono />
                  <Stat label="Token1" value={shortenAddress(p.token1)} mono />
                </div>
              )
            })}
          </div>
        )}
      </div>

      <SignDemoTx />
    </div>
  )
}

function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">{label}</div>
      <div className={`text-text font-medium ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  )
}
