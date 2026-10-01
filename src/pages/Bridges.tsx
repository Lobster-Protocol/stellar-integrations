import { lazy, Suspense, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'

import { cn, formatBalance, shortenAddress, stellarExplorer } from '../utils/format'
import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useCustody } from '../contexts/CustodyContext'
import { useTrustline } from '../integrations/stellar/trustline'
import { useActivity } from '../integrations/horizon/activity'
import { trackTransfer, useTrackedTransfers, type TrackedTransfer, type TransferDirection } from '../integrations/cctp/transfers'
import {
  BRIDGE_FALLBACK_LINKS,
  CCTP_EVM_USDC_DECIMALS,
  CONTRACTS,
  STELLAR_CCTP_DOMAIN,
  cctpChainsFor,
  type CctpSourceChain,
  type Network,
} from '../config/contracts'
import { Card, CardHead, Empty, Stat } from '../components/ui'
import { InfoTip } from '../components/InfoTip'

// the bridge pulls in viem and the CCTP code, so keep it out of the page chunk
const BridgeModal = lazy(() => import('../components/BridgeModal'))
const BridgeWallets = lazy(() => import('../components/BridgeWallets'))
const InProgressRow = lazy(() => import('../components/BridgeTransfers').then((m) => ({ default: m.InProgressRow })))
const HistoryRow = lazy(() => import('../components/BridgeTransfers').then((m) => ({ default: m.HistoryRow })))

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

function Corridor({ from, to, burned, minted }: { from: string[]; to: string[]; burned: string; minted: string }) {
  return (
    <div className="flex items-stretch gap-2 text-xs">
      <div className="flex-1 rounded-2xl bg-bg px-3 py-3">
        <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">From</div>
        <ul className="space-y-1">
          {from.map((c) => (
            <li key={c} className="text-text">
              {c}
            </li>
          ))}
        </ul>
        <div className="text-text-muted mt-1.5">{burned}</div>
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
        <ul className="space-y-1">
          {to.map((c) => (
            <li key={c} className="text-text">
              {c}
            </li>
          ))}
        </ul>
        <div className="text-text-muted mt-1.5">{minted}</div>
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
  const { address: walletAddress } = useWallet()
  const { mode: custodyMode, dfnsAddress } = useCustody()
  // under DFNS custody the USDC arrives in the treasury, whoever delivers it
  const address = (custodyMode === 'dfns' ? dfnsAddress : null) ?? walletAddress
  const { network } = useNetwork()
  const { usdcIssuer, forwarder } = CONTRACTS[network].cctp
  const trustlineQuery = useTrustline(address, 'USDC', usdcIssuer, network)
  const activityQ = useActivity(network, address)
  const tracked = useTrackedTransfers(network)
  const chains = cctpChainsFor(network)

  const [open, setOpen] = useState(false)
  const [resume, setResume] = useState<TrackedTransfer | null>(null)
  const [direction, setDirection] = useState<TransferDirection>('to-stellar')

  // either account can finish a delivery: mint_and_forward needs no signature from the
  // one paid. A transfer out of Stellar is listed for the browser that started it
  const pending = tracked.filter(
    (t) =>
      t.stage === 'burned' &&
      (t.direction === 'from-stellar' || !address || t.recipient === address || t.recipient === walletAddress),
  )
  const history = tracked.filter((t) => t.stage === 'delivered').slice(0, 10)

  let trustlineLabel: string
  let trustlineClass: string
  if (!address) {
    trustlineLabel = 'Connect wallet'
    trustlineClass = 'text-text-muted'
  } else if (trustlineQuery.isPending) {
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

  const openFresh = (d: TransferDirection) => {
    setResume(null)
    setDirection(d)
    setOpen(true)
  }
  const openOn = (t: TrackedTransfer) => {
    setResume(t)
    setOpen(true)
  }
  const names = chains.map((c) => c.name)

  return (
    <div className="space-y-6">
      <Suspense fallback={null}>
        <BridgeModal open={open} onClose={() => setOpen(false)} resume={resume} initialDirection={direction} />
      </Suspense>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold text-text">Bridges</h2>
          <p className="text-xs text-text-secondary mt-1">
            USDC between Stellar and {names.join(', ')}, in both directions, through Circle CCTP. Where each transfer
            stands, and what has to be ready first.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => openFresh('from-stellar')}
            className="px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/15 transition-all"
          >
            Send out of Stellar
          </button>
          <button
            onClick={() => openFresh('to-stellar')}
            className="px-5 py-2 rounded-full bg-primary text-white text-sm font-semibold hover:bg-primary-dark transition-all"
            style={{ boxShadow: '0 8px 20px rgba(54, 147, 251, 0.2)' }}
          >
            Bridge USDC
          </button>
        </div>
      </div>

      <Card>
        <CardHead
          title="Your wallets"
          note="Both ends of the bridge. The EVM wallet holds the USDC on the other chains, the Stellar wallet holds it on Stellar; each signs on its own chain."
        />
        <Suspense fallback={<p className="text-xs text-text-muted">Loading wallets...</p>}>
          <BridgeWallets network={network} />
        </Suspense>
      </Card>

      {pending.length > 0 && (
        <Card>
          <CardHead
            title="Waiting to be delivered"
            note="Burned on one side, not yet arrived on the other. The USDC is safe; each line says whose move it is, and Finish opens it."
          />
          <ul className="divide-y divide-border">
            <Suspense fallback={null}>
              {pending.map((t) => (
                <InProgressRow key={t.id} network={network} transfer={t} onOpen={openOn} />
              ))}
            </Suspense>
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Carried by" value="Circle CCTP" sub={network === 'testnet' ? 'test networks, test USDC' : 'mainnet'} />
        <Stat label="Token" value="USDC" sub={`${chains.length} chains, both ways`} />
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
          note="USDC is burned on the chain it leaves, Circle signs that burn, and the same amount, less Circle's fee when there is one, is minted as native USDC on the other side. No wrapped token, no pool in between."
        />
        <div className="space-y-3">
          <Corridor from={names} to={['Stellar']} burned="USDC is burned" minted="native USDC is minted to you" />
          <Corridor
            from={['Stellar']}
            to={names}
            burned="USDC is burned"
            minted="minted by Circle, or by your EVM wallet"
          />
        </div>
        {network === 'testnet' && (
          <p className="text-xs text-text-secondary mt-3">
            On testnet every step is real, on Circle's test networks with test USDC that has no value. That is
            where to try it first.
          </p>
        )}
      </Card>

      <Card>
        <CardHead title="Before you bridge" />
        <div className="grid gap-4 sm:grid-cols-2 text-xs">
          <div>
            <p className="text-text font-medium mb-2">Into Stellar</p>
            <ol className="space-y-2.5">
              <Step n={1}>
                Turn on a USDC trustline <InfoTip term="trustline" label="a trustline" /> for your Stellar account.
                Without it the USDC has nowhere to land.{' '}
                <span className={cn('font-medium', trustlineClass)}>{trustlineLabel}</span>
              </Step>
              <Step n={2}>
                Connect an EVM wallet holding USDC and a little gas on {names.join(', ')}.
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
                <button type="button" onClick={() => openFresh('to-stellar')} className="text-primary hover:underline">
                  the bridge
                </button>
                . Your EVM wallet signs the burn, then your Stellar wallet signs the delivery once Circle has signed.
              </Step>
            </ol>
          </div>
          <div>
            <p className="text-text font-medium mb-2">Out of Stellar</p>
            <ol className="space-y-2.5">
              <Step n={1}>Connect the Stellar wallet that holds the USDC, with a little XLM for two network fees.</Step>
              <Step n={2}>Connect the EVM wallet that should receive the USDC.</Step>
              <Step n={3}>
                Open{' '}
                <button type="button" onClick={() => openFresh('from-stellar')} className="text-primary hover:underline">
                  the way out
                </button>
                . Your Stellar wallet approves the exact amount and burns it; Circle then mints it on the EVM chain for a
                small fee, or your EVM wallet receives it and pays the gas.
              </Step>
            </ol>
          </div>
        </div>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHead title="Finished here" note="Transfers this browser saw through, both ways, with each side's transaction." />
          <ul className="divide-y divide-border">
            <Suspense fallback={null}>
              {history.map((t) => (
                <HistoryRow key={t.id} network={network} transfer={t} />
              ))}
            </Suspense>
          </ul>
        </Card>
      )}

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
                <span className="text-text">+{formatBalance(move!.amount)} USDC</span>
                <span className="flex items-center gap-3">
                  <span className="text-text-muted">{new Date(e.at).toLocaleDateString('en-GB')}</span>
                  {e.txHash && (
                    <a
                      href={stellarExplorer(network, 'tx', e.txHash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      {shortenAddress(e.txHash, 4, 4)} <ExternalLink size={10} />
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <FinishElsewhere network={network} chains={chains} forwarder={forwarder} onFound={openOn} />

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

// a source chain to pick for a burn made elsewhere: one of the EVM chains, or Stellar
const STELLAR_KEY = 'STELLAR'

function FinishElsewhere({
  network,
  chains,
  forwarder,
  onFound,
}: {
  network: Network
  chains: CctpSourceChain[]
  forwarder: string
  onFound: (t: TrackedTransfer) => void
}) {
  const [chainKey, setChainKey] = useState(chains[0]?.key ?? '')
  const [hash, setHash] = useState('')
  const [state, setState] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null })
  const fromStellar = chainKey === STELLAR_KEY
  const chain = chains.find((c) => c.key === chainKey) ?? chains[0]

  const find = async (e: FormEvent) => {
    e.preventDefault()
    if (state.busy) return
    setState({ busy: true, error: null })
    try {
      const t = fromStellar ? await readStellarBurn(network, chains, hash) : await readEvmBurn(network, chain, hash, forwarder)
      trackTransfer(t)
      setHash('')
      setState({ busy: false, error: null })
      onFound(t)
    } catch (err) {
      setState({ busy: false, error: err instanceof Error ? err.message.split('\n')[0] : 'Something went wrong' })
    }
  }

  return (
    <Card>
      <CardHead
        title="Finish a transfer started elsewhere"
        note="A burn made from another device, or straight from a custody platform, can be finished here. Pick the chain it was burned on and paste its hash; the dashboard reads the rest from the chain."
      />
      <form onSubmit={find} className="flex flex-wrap items-center gap-2 text-xs">
        {[...chains.map((c) => ({ key: c.key, name: c.name })), { key: STELLAR_KEY, name: 'Stellar' }].map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setChainKey(c.key)}
            aria-pressed={chainKey === c.key}
            className={cn(
              'px-3 py-1.5 rounded-full font-medium transition-all',
              chainKey === c.key ? 'bg-primary/10 text-primary ring-1 ring-primary/30' : 'bg-bg text-text-secondary',
            )}
          >
            {c.name}
          </button>
        ))}
        <input
          type="text"
          value={hash}
          onChange={(e) => setHash(e.target.value)}
          placeholder={fromStellar ? 'Stellar burn transaction hash' : '0x... burn transaction hash'}
          aria-label="Burn transaction hash"
          spellCheck={false}
          className="flex-1 min-w-[220px] px-3 py-1.5 rounded-xl bg-bg text-text font-mono outline-none focus:ring-1 focus:ring-primary/30"
        />
        <button
          type="submit"
          disabled={!hash.trim() || state.busy}
          className="px-4 py-1.5 rounded-full bg-primary text-white font-medium disabled:opacity-40"
        >
          {state.busy ? 'Reading...' : 'Find it'}
        </button>
      </form>
      {state.error && <p className="mt-2 text-[11px] text-coral break-words">{state.error}</p>}
    </Card>
  )
}

async function readEvmBurn(
  network: Network,
  chain: CctpSourceChain,
  raw: string,
  forwarder: string,
): Promise<TrackedTransfer> {
  // loaded on demand: the page chunk stays free of the EVM code
  const [{ readBurnToStellar }, { formatUnits }] = await Promise.all([
    import('../integrations/cctp/evm-burn'),
    import('viem'),
  ])
  // lower case, so a hash pasted in capitals matches the one already tracked here
  const id = raw.trim().toLowerCase() as `0x${string}`
  const burn = await readBurnToStellar(chain, id, forwarder)
  return {
    id,
    direction: 'to-stellar',
    network,
    chainKey: chain.key,
    chainName: chain.name,
    sourceDomain: chain.domain,
    amount: formatUnits(burn.units, CCTP_EVM_USDC_DECIMALS),
    recipient: burn.recipient,
    finality: burn.finality,
    createdAt: Date.now(),
    stage: 'burned',
  }
}

// A burn out of Stellar is read back from Circle, which has signed it within seconds:
// the message names the EVM chain, the wallet it pays and whether Circle mints it
async function readStellarBurn(network: Network, chains: CctpSourceChain[], raw: string): Promise<TrackedTransfer> {
  const [{ fetchAttestation }, { decodeCctpMessage, evmRecipientOf, hexToBytes }, { formatUnits }] = await Promise.all([
    import('../integrations/cctp/iris'),
    import('../integrations/cctp/message'),
    import('viem'),
  ])
  const id = raw.trim().replace(/^0x/i, '').toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(id)) throw new Error('Enter a Stellar transaction hash, 64 hex characters')
  const att = await fetchAttestation(network, STELLAR_CCTP_DOMAIN, id, 10_000, null)
  if (att.state !== 'complete') {
    throw new Error('Circle has no signed burn under that hash yet. A Stellar burn is signed within a minute; try again shortly.')
  }
  const msg = decodeCctpMessage(hexToBytes(att.message))
  const chain = chains.find((c) => c.domain === msg.destinationDomain)
  if (!chain) throw new Error('That burn is bound for a chain this page does not carry')
  const magic = new TextDecoder().decode(msg.body.hookData.subarray(0, 12))
  return {
    id,
    direction: 'from-stellar',
    network,
    chainKey: chain.key,
    chainName: chain.name,
    sourceDomain: STELLAR_CCTP_DOMAIN,
    amount: formatUnits(msg.body.amount, CCTP_EVM_USDC_DECIMALS),
    recipient: evmRecipientOf(msg),
    finality: 'standard',
    forwarded: magic === 'cctp-forward',
    createdAt: Date.now(),
    stage: 'burned',
  }
}
