import CustodyModeToggle from '../components/CustodyModeToggle'
import DfnsWalletList from '../components/DfnsWalletList'
import PendingApprovalsPanel from '../components/PendingApprovalsPanel'
import PoliciesPanel from '../components/PoliciesPanel'
import MpcSignatureFeed from '../components/MpcSignatureFeed'
import MicaExportButton from '../components/MicaExportButton'

export default function Audit() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text">Custody and audit</h2>
        <p className="text-xs text-text-secondary mt-1">
          DFNS MPC custody status, policy approvals, live signature feed and MiCA-aligned export.
        </p>
      </div>

      <CustodyModeToggle />

      <DfnsWalletList />

      <PendingApprovalsPanel />

      <PoliciesPanel />

      <MicaExportButton />

      <MpcSignatureFeed />
    </div>
  )
}
