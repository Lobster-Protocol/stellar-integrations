import { useCustody } from '../contexts/CustodyContext'
import {
  useDfnsWallets,
  useDfnsPolicies,
  useDfnsPendingApprovals,
  RelayError,
} from '../integrations/dfns/hooks'
import CustodyModeToggle from '../components/CustodyModeToggle'
import DfnsWalletList from '../components/DfnsWalletList'
import PendingApprovalsPanel from '../components/PendingApprovalsPanel'
import PoliciesPanel from '../components/PoliciesPanel'
import MpcSignatureFeed from '../components/MpcSignatureFeed'
import MicaExportButton from '../components/MicaExportButton'
import { Card, Empty, Stat } from '../components/ui'
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
  const { mode } = useCustody()
  const wallets = useDfnsWallets()
  const policies = useDfnsPolicies()
  const approvals = useDfnsPendingApprovals()

  const configured = !!import.meta.env.VITE_LOBSTER_API_URL
  const walletItems = wallets.data?.items ?? []
  const active = (policies.data?.items ?? []).filter((p) => p.status === 'Active')
  const waiting = (approvals.data?.items ?? []).length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text">
          Custody and audit <InfoTip term="custody" label="custody" />
        </h2>
        <p className="text-xs text-text-secondary mt-1">
          Who holds the keys, what has to be approved before they sign, and the record that comes
          out of it.
        </p>
      </div>

      {!configured ? (
        <Card>
          <Empty>
            The custody service is not wired up in this build (VITE_LOBSTER_API_URL is not set),
            so the figures below cannot be filled in.
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
            value={mode === 'dfns' ? 'DFNS MPC' : 'Browser wallet'}
            sub={mode === 'dfns' ? 'key split across several servers' : 'keys in your browser wallet'}
            tone={mode === 'dfns' ? 'accent' : 'plain'}
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

      <CustodyModeToggle />

      <PendingApprovalsPanel />

      <PoliciesPanel />

      <DfnsWalletList />

      <MicaExportButton />

      <MpcSignatureFeed />
    </div>
  )
}
