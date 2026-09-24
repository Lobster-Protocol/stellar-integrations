import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'

import { cn, shortenAddress } from '../utils/format'
import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useTrustline } from '../integrations/stellar/trustline'
import { useActivity } from '../integrations/horizon/activity'
import { forgetTransfer, useTrackedTransfers, type TrackedTransfer } from '../integrations/cctp/transfers'
import { BRIDGE_FALLBACK_LINKS, CONTRACTS, cctpChainsFor } from '../config/contracts'
import { Card, CardHead, Empty, Stat } from '../components/ui'
import { InfoTip } from '../components/InfoTip'

// the bridge pulls in viem and the CCTP code, so keep it out of the page chunk
const BridgeModal = lazy(() => import('../components/BridgeModal'))

function Arrow() {
  return (
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
  )
}

function Corridor({ chains }: { chains: string[] }) {
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
        <div className="text-text-muted mt-1.5">USDC is burned</div>
      </div>
      <Arrow />
      <div className="flex-1 rounded-2xl bg-primary/5 px-3 py-3">
        <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">Through</div>
        <div className="text-text font-medium">Circle CCTP</div>
        <div className="text-text-muted mt-1.5">Circle signs the burn</div>
      </div>
      <Arrow />
      <div className="flex-1 rounded-2xl bg-bg px-3 py-3">
        <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">To</div>
        <div className="text-text">Stellar</div>
        <div className="text-text-muted mt-1.5">native USDC is minted to you</div>
      </div>
    </div>
  )
}

const OTHER_ROUTES: Array<{ href: string; label: string; note: string; testnetOnly?: boolean }> = [
  {
    href: BRIDGE_FALLBACK_LINKS.circleFaucet,
    label: 'Circle faucet',
    note: 'Free test USDC on Base Sepolia, Arbitrum Sepolia or Sepolia.',
    testnetOnly: true,
  },
  {
    href: BRIDGE_FALLBACK_LINKS.allbridgeCore,
    label: 'Allbridge Core',
    note: 'Stablecoins between other chains. It lists no route into Stellar today.',
  },
  {
    href: BRIDGE_FALLBACK_LINKS.allbridgeClassic,
    label: 'Allbridge Classic',
    note: 'Other assets and chains that CCTP does not carry.',
  },
  {
    href: BRIDGE_FALLBACK_LINKS.stellarx,
    label: 'StellarX',
    note: 'Swap on Stellar once the USDC has landed.',
  },
  {
    href: BRIDGE_FALLBACK_LINKS.aquarius,
    label: 'Aquarius',
    note: 'Pools and swaps on Stellar.',
  },
  {
    href: BRIDGE_FALLBACK_LINKS.stellarAnchors,
    label: 'Stellar anchors',
    note: 'Cash in or out through a regulated anchor. Not a bridge.',
  },
]

export default function Bridges() {
  const { address } = useWallet()
  const { network } = useNetwork()
  const { usdcIssuer, forwarder } = CONTRACTS[network].cctp
  const trustlineQuery = useTrustline(address, 'USDC', usdcIssuer, network)
  const activityQ = useActivity(network, address)
  const tracked = useTrackedTransfers(network)
  const chains = cctpChainsFor(network)

  const [open, setOpen] = useState(false)
  const [resume, setResume] = useState<TrackedTransfer | null>(null)

  const pending = tracked.filter((t) => t.stage === 'burned' && (!address || t.recipient === address))

  let trustlineLabel: string
  let trustlineClass: string
  if (!address) {
    trustlineLabel = 'Connect wallet'
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

  // a delivery is a transfer out of Circle's forwarder, so filtering on it keeps
  // ordinary USDC payments out of this list
  const arrivals = useMemo(() => {
    const events = (activityQ.data?.pages ?? []).flatMap((p) => p.events)
    return events
      .map((e) => ({
        e,
        move: e.moves.find(
          (m) =>
            m.code === 'USDC' && m.issuer === usdcIssuer && m.direction === 'in' && m.counterparty === forwarder,
        ),
      }))
      .filter((x) => !!x.move)
  }, [activityQ.data, usdcIssuer, forwarder])

  const openFresh = () => {
    setResume(null)
    setOpen(true)
  }

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <BridgeModal open={open} onClose={() => setOpen(false)} resume={resume} />
      </Suspense>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-text">Bridges</h2>
          <p className="text-xs text-text-secondary mt-1">
            Bringing USDC from another chain onto Stellar, and what has to be ready before it can arrive.
          </p>
        </div>
        <button
          onClick={openFresh}
          className="px-5 py-2 rounded-full bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-all shrink-0"
          style={{ boxShadow: '0 8px 20px rgba(54, 147, 251, 0.2)' }}
        >
          Bridge USDC
        </button>
      </div>

      {pending.length > 0 && (
        <Card>
          <CardHead
            title="Waiting to be delivered"
            note="Burned on the source chain, not yet collected on Stellar. The USDC is safe, it just needs one more signature."
          />
          <ul className="divide-y divide-border">
            {pending.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                <span className="text-text">
                  {t.amount} USDC from {t.chainName}
                  <span className="text-text-muted ml-2">{new Date(t.createdAt).toLocaleString('en-GB')}</span>
                </span>
                <span className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => {
                      if (window.confirm('Stop tracking this transfer here? It stays on chain either way.')) {
                        forgetTransfer(network, t.id)
                      }
                    }}
                    className="text-text-muted hover:text-coral"
                  >
                    forget
                  </button>
                  <button
                    onClick={() => {
                      setResume(t)
                      setOpen(true)
                    }}
                    className="px-3 py-1 rounded-full bg-primary text-white font-medium"
                  >
                    Finish
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Carried by" value="Circle CCTP" sub={network === 'testnet' ? 'test networks, test USDC' : 'mainnet'} />
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
        <Stat
          label="Arrivals seen"
          value={address && activityQ.isSuccess ? String(arrivals.length) : '-'}
          sub={
            !address
              ? 'no wallet connected'
              : activityQ.isSuccess
                ? 'delivered by the bridge'
                : activityQ.isError
                  ? 'could not read this account'
                  : 'reading this account'
          }
        />
      </div>

      <Card>
        <CardHead
          title="The route"
          note="USDC is burned on the source chain, Circle signs that burn, and the burned amount, less Circle's fee on a fast transfer, is minted as native USDC on Stellar. No wrapped token, no pool in between."
        />
        <Corridor chains={chains.map((c) => c.name)} />
        {network === 'testnet' && (
          <p className="text-xs text-text-secondary mt-3">
            On testnet every step is real, on Circle's test networks with test USDC that has no value. That is
            where to try it first.
          </p>
        )}
      </Card>

      <Card>
        <CardHead title="Before you bridge" />
        <ol className="space-y-2.5 text-xs">
          <Step n={1}>
            Turn on a USDC trustline <InfoTip term="trustline" label="a trustline" /> for your Stellar account.
            Without it the USDC has nowhere to land.{' '}
            <span className={cn('font-medium', trustlineClass)}>{trustlineLabel}</span>
          </Step>
          <Step n={2}>
            Connect a browser wallet holding USDC and a little gas on {chains.map((c) => c.name).join(', ')}.
            {network === 'testnet' && (
              <>
                {' '}
                Test USDC comes from{' '}
                <a
                  href={BRIDGE_FALLBACK_LINKS.circleFaucet}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Circle's faucet
                </a>
                .
              </>
            )}
          </Step>
          <Step n={3}>
            Open{' '}
            <button type="button" onClick={openFresh} className="text-primary hover:underline">
              the bridge
            </button>
            . Your EVM wallet signs the burn, then your Stellar wallet signs the delivery once Circle has signed.
          </Step>
        </ol>
      </Card>

      <Card>
        <CardHead
          title="Arrivals"
          note="USDC the bridge delivered to this account, read live from Stellar."
          meta={
            <Link to="/activity" className="text-xs text-primary hover:underline">
              All activity
            </Link>
          }
        />
        {!address ? (
          <Empty>Connect a wallet to look for incoming USDC.</Empty>
        ) : arrivals.length === 0 ? (
          <Empty>No USDC has arrived through the bridge yet.</Empty>
        ) : (
          <ul className="divide-y divide-border">
            {arrivals.slice(0, 8).map(({ e, move }) => (
              <li key={e.id} className="flex items-center justify-between gap-3 py-2.5 text-xs">
                <span className="text-text">+{move!.amount} USDC</span>
                <span className="text-text-muted">{new Date(e.at).toLocaleDateString('en-GB')}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHead
          title="Other routes"
          note="For an asset or a chain this bridge does not carry. These open outside the dashboard."
        />
        <ul className="grid gap-2 sm:grid-cols-2">
          {OTHER_ROUTES.filter((r) => !r.testnetOnly || network === 'testnet').map((r) => (
            <li key={r.href}>
              <a
                href={r.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start justify-between gap-3 rounded-2xl bg-bg px-3 py-2.5 text-xs hover:bg-bg/70 transition-all"
              >
                <span>
                  <span className="text-text font-medium block">{r.label}</span>
                  <span className="text-text-muted">{r.note}</span>
                </span>
                <ExternalLink size={12} className="text-text-muted shrink-0 mt-0.5" />
              </a>
            </li>
          ))}
        </ul>
        {address && (
          <p className="text-[11px] text-text-muted mt-3">
            Anything you bring in lands on {shortenAddress(address, 6, 4)}.
          </p>
        )}
      </Card>
    </div>
  )
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="shrink-0 h-5 w-5 rounded-full bg-bg text-text-secondary flex items-center justify-center text-[10px]">
        {n}
      </span>
      <span className="text-text-secondary">{children}</span>
    </li>
  )
}
