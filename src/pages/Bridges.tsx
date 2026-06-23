import { cn } from '../utils/format'
import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useTrustline } from '../integrations/allbridge/hooks'
import { CONTRACTS } from '../config/contracts'

// Real bridge surface: the Allbridge provider plus a live USDC trustline check
// for the connected wallet. The bridge itself runs from the Deposit flow, where
// the real fee, gas and time come from the live Allbridge quote. No seeded
// history here.
export default function Bridges() {
  const { address } = useWallet()
  const { network } = useNetwork()
  const usdcIssuer = CONTRACTS[network].tokens.usdcIssuer
  const trustlineQuery = useTrustline(address, 'USDC', usdcIssuer, network)

  let trustlineLabel: string
  let trustlineClass: string
  if (!address) {
    trustlineLabel = 'Connect wallet'
    trustlineClass = 'text-text-muted'
  } else if (!usdcIssuer) {
    trustlineLabel = 'Not on testnet'
    trustlineClass = 'text-text-muted'
  } else if (trustlineQuery.isLoading) {
    trustlineLabel = 'Checking...'
    trustlineClass = 'text-text-muted'
  } else if (trustlineQuery.isError) {
    trustlineLabel = 'Unknown'
    trustlineClass = 'text-coral'
  } else {
    trustlineLabel = trustlineQuery.data ? 'Active' : 'Missing'
    trustlineClass = trustlineQuery.data ? 'text-green' : 'text-coral'
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-text">Cross-Chain Bridges</h2>

      <div className="bg-bg-card rounded-3xl p-5 card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text">Bridge Provider</h3>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
            Allbridge Core
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-text-muted text-xs">Supported Token</p>
            <p className="text-text font-medium">USDC</p>
          </div>
          <div>
            <p className="text-text-muted text-xs">Source Chains</p>
            <p className="text-text font-medium">Ethereum, Arbitrum, BSC</p>
          </div>
          <div>
            <p className="text-text-muted text-xs">Trustline Status</p>
            <p className={cn('font-medium', trustlineClass)}>{trustlineLabel}</p>
          </div>
        </div>
      </div>

      <div className="bg-bg-card rounded-3xl p-5 card">
        <p className="text-sm text-text-secondary">
          Bridge USDC into Stellar from an EVM chain with the <span className="text-text font-medium">+ Deposit</span> button
          on the Overview page. The live fee, gas cost and estimated time come from the Allbridge quote at the moment you bridge.
        </p>
      </div>
    </div>
  )
}
