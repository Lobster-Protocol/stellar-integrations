import { useCustody } from '../contexts/CustodyContext'
import { useDfnsWallets, useDfnsPolicies, useDfnsPendingApprovals } from '../integrations/dfns/hooks'
import CustodyModeToggle from '../components/CustodyModeToggle'
import DfnsWalletList from '../components/DfnsWalletList'
import PendingApprovalsPanel from '../components/PendingApprovalsPanel'
import PoliciesPanel from '../components/PoliciesPanel'
import MpcSignatureFeed from '../components/MpcSignatureFeed'
import MicaExportButton from '../components/MicaExportButton'
import { Card, Empty, Stat } from '../components/ui'
import { InfoTip } from '../components/InfoTip'

export default function Audit() {
  const { mode } = useCustody()
  const wallets = useDfnsWallets()
  const policies = useDfnsPolicies()
  const approvals = useDfnsPendingApprovals()

  const configured = !!import.meta.env.VITE_LOBSTER_API_URL
  const walletItems = wallets.data?.items ?? []
  const active = (policies.data?.items ?? []).filter((p) => p.status === 'Active')
  const waiting = approvals.data?.items.length ?? 0

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
            The custody service is not wired up in this build, so there is nothing to audit here.
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
                : 'custody service unreachable'
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
                ? 'custody service unreachable'
                : active.length === 0
                  ? 'nothing has to be approved'
                  : 'each matching payment needs approval'
            }
            tone={policies.isSuccess && active.length === 0 ? 'down' : 'plain'}
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
                ? 'custody service unreachable'
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
