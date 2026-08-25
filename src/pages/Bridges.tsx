import { useMemo } from 'react'
import { Link } from 'react-router-dom'

import { cn } from '../utils/format'
import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useTrustline } from '../integrations/allbridge/hooks'
import { useActivity } from '../integrations/horizon/activity'
import {
  CONTRACTS,
  EVM_BRIDGEABLE,
  EVM_CHAIN_NAME,
  EVM_USDC,
  type EvmChain,
} from '../config/contracts'
import { Card, CardHead, Empty, Stat } from '../components/ui'
import { InfoTip } from '../components/InfoTip'

// The corridor drawn end to end: an EVM chain, the Allbridge pool that carries
// the value across, and the Stellar account it lands on.
function Corridor({ chains, live }: { chains: string[]; live: boolean }) {
  return (
    <div className="flex items-stretch gap-2 text-xs">
      <div className="flex-1 rounded-2xl bg-bg px-3 py-3">
        <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">From</div>
        <ul className="space-y-1">
          {chains.map((c) => (
            <li key={c} className="text-text">
              {c}
            </li>
          ))}
        </ul>
        <div className="text-text-muted mt-1.5">USDC</div>
      </div>

      <div className="flex items-center text-text-muted px-1" aria-hidden>
        <svg width="26" height="12" viewBox="0 0 26 12" fill="none">
          <path
            d="M0 6h22m0 0-5-5m5 5-5 5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="flex-1 rounded-2xl bg-primary/5 px-3 py-3">
        <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">Through</div>
        <div className="text-text font-medium">Allbridge Core</div>
        <div className="text-text-muted mt-1.5">
          {live ? 'moves USDC across' : 'mainnet only'}
        </div>
      </div>

      <div className="flex items-center text-text-muted px-1" aria-hidden>
        <svg width="26" height="12" viewBox="0 0 26 12" fill="none">
          <path
            d="M0 6h22m0 0-5-5m5 5-5 5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="flex-1 rounded-2xl bg-bg px-3 py-3">
        <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">To</div>
        <div className="text-text">Stellar</div>
        <div className="text-text-muted mt-1.5">your connected account</div>
      </div>
    </div>
  )
}

export default function Bridges() {
  const { address } = useWallet()
  const { network } = useNetwork()
  const usdcIssuer = CONTRACTS[network].tokens.usdcIssuer
  const trustlineQuery = useTrustline(address, 'USDC', usdcIssuer, network)
  const activityQ = useActivity(network, address)

  const chains = (Object.keys(EVM_USDC) as EvmChain[]).filter((c) => EVM_BRIDGEABLE[c])
  const live = !!CONTRACTS[network].allbridge.bridge

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

  // a bridge lands as a USDC credit that this account did not send itself
  const arrivals = useMemo(() => {
    const events = (activityQ.data?.pages ?? []).flatMap((p) => p.events)
    return events.filter(
      (e) => e.kind === 'received' && e.moves.some((m) => m.code === 'USDC' && m.direction === 'in'),
    )
  }, [activityQ.data])

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text">Bridges</h2>
        <p className="text-xs text-text-secondary mt-1">
          Bringing USDC from another chain onto Stellar, and what has to be ready before it can
          arrive.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Provider" value="Allbridge Core" sub={live ? 'live on this network' : 'mainnet only'} />
        <Stat label="Token" value="USDC" sub={`${chains.length} source chains`} />
        <Stat
          label={
            <>
              Trustline <InfoTip term="trustline" label="a trustline" />
            </>
          }
          value={trustlineLabel}
          tone={trustlineLabel === 'Active' ? 'up' : trustlineLabel === 'Missing' ? 'down' : 'plain'}
          sub="needed before USDC can arrive"
        />
        <Stat label="Arrivals seen" value={String(arrivals.length)} sub="USDC credits on this account" />
      </div>

      <Card>
        <CardHead
          title="The route"
          note="USDC leaves another chain, crosses the Allbridge bridge, and lands as USDC in the Stellar account you have connected."
        />
        <Corridor chains={chains.map((c) => EVM_CHAIN_NAME[c])} live={live} />
        {!live && (
          <p className="text-xs text-coral mt-3">
            Allbridge has no testnet deployment, so nothing can be bridged while the dashboard is on
            testnet. Switch to mainnet to send a real transfer.
          </p>
        )}
      </Card>

      <Card>
        <CardHead title="Before you bridge" />
        <ol className="space-y-2.5 text-xs">
          <li className="flex gap-3">
            <span className="shrink-0 h-5 w-5 rounded-full bg-bg text-text-secondary flex items-center justify-center text-[10px]">
              1
            </span>
            <span className="text-text-secondary">
              Turn on a USDC trustline <InfoTip term="trustline" label="a trustline" /> for your
              Stellar account. Without it, the incoming USDC has nowhere to land.{' '}
              <span className={cn('font-medium', trustlineClass)}>{trustlineLabel}</span>
            </span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 h-5 w-5 rounded-full bg-bg text-text-secondary flex items-center justify-center text-[10px]">
              2
            </span>
            <span className="text-text-secondary">
              Connect the wallet that holds your USDC on{' '}
              {chains.map((c) => EVM_CHAIN_NAME[c]).join(' or ')}.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="shrink-0 h-5 w-5 rounded-full bg-bg text-text-secondary flex items-center justify-center text-[10px]">
              3
            </span>
            <span className="text-text-secondary">
              Use{' '}
              <Link to="/" className="text-primary hover:underline">
                Deposit on Overview
              </Link>
              . The amount you receive and the arrival estimate come from a live Allbridge quote at
              that moment.
            </span>
          </li>
        </ol>
      </Card>

      <Card>
        <CardHead
          title="Arrivals"
          note="USDC that has landed in this account, read live from Stellar."
          meta={
            <Link to="/activity" className="text-xs text-primary hover:underline">
              All activity
            </Link>
          }
        />
        {!address ? (
          <Empty>Connect a wallet to look for incoming USDC.</Empty>
        ) : arrivals.length === 0 ? (
          <Empty>No USDC has arrived on this account yet.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {arrivals.slice(0, 8).map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                <span className="text-text">
                  {e.moves
                    .filter((m) => m.code === 'USDC')
                    .map((m) => `+${m.amount} USDC`)
                    .join(' ')}
                </span>
                <span className="text-text-muted">
                  {new Date(e.at).toLocaleDateString('en-GB')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
