import { InfoTip } from './InfoTip'
import ConnectDfnsPanel from './ConnectDfnsPanel'

// The DFNS custody panel. Connect your OWN DFNS organization and its wallets, policies and
// approvals fill the panels below. There is no "browser wallet vs DFNS" switch anymore: you sign
// with whatever wallet you connect at the top right, and this panel is only about DFNS custody.
// The Lobster testnet demo is one row you can pick to see the flow without your own DFNS.
export default function CustodyModeToggle() {
  return (
    <div className="rounded-3xl p-5 bg-bg-card card">
      <h3 className="text-sm font-semibold text-text mb-1">
        DFNS custody <InfoTip term="custody" label="custody" />
      </h3>
      <p className="text-xs text-text-secondary mb-3">
        Connect your own DFNS organization: its keys sign and every approval happens in your own
        DFNS console. Connect it over WalletConnect from the wallet menu at the top right, or point
        the dashboard at a relay you run. There is no key to paste here. To see the flow without
        your own DFNS, pick the Lobster testnet demo below.
      </p>
      <ConnectDfnsPanel />
    </div>
  )
}
