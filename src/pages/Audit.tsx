import {
  useDfnsWallets,
  useDfnsPolicies,
  useDfnsPendingApprovals,
  RelayError,
} from '../integrations/dfns/hooks'
import { useHasActiveRelay } from '../integrations/dfns/use-profiles'
import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useFactoryInfo } from '../integrations/lobster/hooks'
import { CONTRACTS } from '../config/contracts'
import { shortenAddress, stellarExplorer } from '../utils/format'
import CustodyModeToggle from '../components/CustodyModeToggle'
import DfnsCustodyIntro from '../components/DfnsCustodyIntro'
import DfnsWalletList from '../components/DfnsWalletList'
import LiveDataMeta from '../components/LiveDataMeta'
import PendingApprovalsPanel from '../components/PendingApprovalsPanel'
import PoliciesPanel from '../components/PoliciesPanel'
import MpcSignatureFeed from '../components/MpcSignatureFeed'
import MicaExportButton from '../components/MicaExportButton'
import SignDemoTx from '../components/SignDemoTx'
import SharedControl from './SharedControl'
import TtlCountdownCard from '../components/TtlCountdownCard'
import { Card, Empty, Failed, Stat } from '../components/ui'
import { InfoTip } from '../components/InfoTip'

// A 401 proves the relay answered: /health returns 200 and the read is the part
// that was turned down. Calling that unreachable sends a reader off hunting for
// a service that is running.
function readFailure(err: unknown): string {
  if (err instanceof RelayError && err.status === 401) {
    return 'relay answered, no valid API token'
  }
  if (err instanceof RelayError && err.status === 503) {
    return 'relay answered, custody not configured'
  }
  return 'custody service unreachable'
}

export default function Audit() {
  const wallets = useDfnsWallets()
  const policies = useDfnsPolicies()
  const approvals = useDfnsPendingApprovals()

  const { address } = useWallet()
  const { network } = useNetwork()
  // mainnet reads need a caller to simulate from, so pass the connected wallet
  // when there is one
  const factoryInfo = useFactoryInfo(network, address || undefined)
  const factoryId = CONTRACTS[network].lobster.factory
  const factoryExplorer = factoryId ? stellarExplorer(network, 'contract', factoryId) : null

  const configured = useHasActiveRelay()
  const walletItems = wallets.data?.items ?? []
  const active = (policies.data?.items ?? []).filter((p) => p.status === 'Active')
  const waiting = (approvals.data?.items ?? []).length

  return (
    <div className="space-y-6">
      <DfnsCustodyIntro />

      <CustodyModeToggle />

      {!configured ? (
        <Card>
          <Empty>
            No DFNS organization is connected yet, so there is nothing to show here. Connect your
            own DFNS in the panel above, or pick the Lobster testnet demo to see the flow.
          </Empty>
        </Card>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat
            label={
              <>
                Signing with <InfoTip term="mpc" label="MPC custody" />
              </>
            }
            value="DFNS MPC"
            sub="key split across several servers"
            tone="accent"
          />
          <Stat
            label="Custody wallets"
            value={wallets.isSuccess ? String(walletItems.length) : '-'}
            sub={
              wallets.isSuccess
                ? `${walletItems.filter((w) => w.network === 'Stellar').length} on mainnet`
                : readFailure(wallets.error)
            }
          />
          {/* a failed read is not a finding: only call signing ungated once we
              have actually seen the policy list */}
          <Stat
            label={
              <>
                Active rules <InfoTip term="policy" label="a signing policy" />
              </>
            }
            value={policies.isSuccess ? String(active.length) : '-'}
            sub={
              !policies.isSuccess
                ? readFailure(policies.error)
                : active.length === 0
                  ? 'nothing has to be approved'
                  : 'each matching payment needs approval'
            }
          />
          <Stat
            label={
              <>
                Waiting on a human <InfoTip term="approval" label="an approval" />
              </>
            }
            value={approvals.isSuccess ? String(waiting) : '-'}
            sub={
              !approvals.isSuccess
                ? readFailure(approvals.error)
                : waiting === 0
                  ? 'nothing held'
                  : 'held until approved'
            }
            tone={approvals.isSuccess && waiting > 0 ? 'accent' : 'plain'}
          />
        </div>
      )}

      <PendingApprovalsPanel />

      <PoliciesPanel />

      <DfnsWalletList />

      <MicaExportButton />

      <MpcSignatureFeed />

      <SharedControl />

      <div>
        <h2 className="text-lg font-semibold text-text">The contract behind every vault</h2>
        <p className="text-sm text-text-secondary mt-1 max-w-2xl leading-relaxed">
          One contract creates every Lobster vault. Below is the address it runs at on this network,
          the account that admins it, and how long its on-chain storage is paid up for.
        </p>
      </div>

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

      <div>
        <h2 className="text-lg font-semibold text-text">Try it on testnet</h2>
        <p className="text-sm text-text-secondary mt-1 max-w-2xl leading-relaxed">
          Nothing above needed a transaction to be true. If you want to watch a signature happen
          anyway, this sends a harmless call on testnet, either from your own wallet or from the
          DFNS treasury.
        </p>
      </div>

      <SignDemoTx />
    </div>
  )
}
