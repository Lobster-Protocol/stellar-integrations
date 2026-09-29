import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { X, Check, ExternalLink } from 'lucide-react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { formatUnits, type Address } from 'viem'

import { cn, shortenAddress, stellarExplorer } from '../utils/format'
import { InfoTip } from './InfoTip'
import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useCustody } from '../contexts/CustodyContext'
import { awaitDfnsSignature } from '../integrations/dfns/await-signature'
import { walletKitSigner } from '../integrations/signer/wallet-kit-signer'
import { networkPassphrase } from '../integrations/lobster/client'
import { buildTrustlineXdr, submitTrustlineTx, useTrustline } from '../integrations/stellar/trustline'
import {
  BRIDGE_FALLBACK_LINKS,
  CCTP_EVM_USDC_DECIMALS,
  CONTRACTS,
  INCLUSION_FEE_STROOPS,
  cctpChainsFor,
  type CctpFinality,
  type CctpSourceChain,
} from '../config/contracts'
import {
  approveUsdc,
  burnToStellar,
  readAllowance,
  ReceiptUnreadError,
  toEvmUsdcUnits,
  UserRejectedError,
} from '../integrations/cctp/evm-burn'
import { maxFeeFor } from '../integrations/cctp/iris'
import { checkClaim, claimOnStellar } from '../integrations/cctp/claim'
import { useAttestation, useCctpFees, useSourceBalances } from '../integrations/cctp/hooks'
import { forgetTransfer, markDelivered, trackTransfer, type TrackedTransfer } from '../integrations/cctp/transfers'

interface Props {
  open: boolean
  onClose: () => void
  // open straight on a transfer that was burned earlier and never delivered
  resume?: TrackedTransfer | null
}

type Phase =
  | { kind: 'form' }
  | { kind: 'approving' }
  | { kind: 'burning' }
  | { kind: 'waiting'; transfer: TrackedTransfer }
  | { kind: 'delivering'; transfer: TrackedTransfer }
  | { kind: 'done'; transfer: TrackedTransfer; deliveredHash: string | null }
  | { kind: 'failed'; msg: string; transfer?: TrackedTransfer }

const USDC = 'USDC'
// what a wallet displays as the fee is our ceiling bid, not what the ledger charges
const INCLUSION_FEE_XLM = Number(INCLUSION_FEE_STROOPS) / 10_000_000

// wagmi's raw "Connector not found." reads like a bug in the page rather than a
// missing wallet extension
function readableConnectError(message: string): string {
  if (/connector not found|no injected|provider not found|window\.ethereum/i.test(message)) {
    return 'No browser wallet answered. Install MetaMask or Rabby, then try again.'
  }
  if (/user rejected|user denied|rejected the request/i.test(message)) {
    return 'The wallet turned the connection down.'
  }
  return message.split('\n')[0].slice(0, 160)
}

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message.split('\n')[0].slice(0, 300)
  return 'Something went wrong'
}

// en-US like the rest of the app: the amount field only takes a dot, and "0,5"
// from a French browser next to it would read as another number format
function fmtUsdc(units: bigint): string {
  const n = Number(formatUnits(units, CCTP_EVM_USDC_DECIMALS))
  return n.toLocaleString('en-US', { maximumFractionDigits: 6 })
}

export default function BridgeModal({ open, onClose, resume }: Props) {
  const { network } = useNetwork()
  const { address: stellarAddr } = useWallet()
  const { mode: custodyMode, dfnsAddress, signer: custodySigner } = useCustody()
  // under DFNS custody the USDC lands in the treasury. The delivery needs no
  // signature from it, so a connected browser wallet pays that fee instead
  const treasury = custodyMode === 'dfns' ? dfnsAddress : null
  const receiving = treasury ?? stellarAddr
  const qc = useQueryClient()
  const chains = cctpChainsFor(network)

  const [chainKey, setChainKey] = useState(chains[0]?.key ?? '')
  const [amount, setAmount] = useState('')
  const [finality, setFinality] = useState<CctpFinality>('fast')
  const [phase, setPhase] = useState<Phase>({ kind: 'form' })
  const [tl, setTl] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null })
  // a declined signature is not an error, but landing back on the form without a word reads like nothing happened
  const [declined, setDeclined] = useState(false)
  const tlInFlight = useRef(false)
  // a double click lands twice before the phase change disables the button, and would ask the wallet for two burns
  const bridgeInFlight = useRef(false)
  const deliverInFlight = useRef(false)

  const chain: CctpSourceChain | null = chains.find((c) => c.key === chainKey) ?? chains[0] ?? null

  const evm = useAccount()
  const { connectors, connect, isPending: isConnecting, error: connectError } = useConnect()
  // a wallet that announces itself (EIP-6963) is listed under its own name, and the
  // generic entry would offer the same wallet again as "Injected"
  const walletOptions = connectors.length > 1 ? connectors.filter((c) => c.id !== 'injected') : connectors
  const { disconnect } = useDisconnect()
  const evmAddr = evm.address as Address | undefined

  const balances = useSourceBalances(chain, evmAddr)
  const fees = useCctpFees(network, chain)

  const { usdcIssuer } = CONTRACTS[network].cctp
  const trustline = useTrustline(receiving, USDC, usdcIssuer, network)
  // fail closed: only a check that came back true unlocks the burn
  const trustlineOk = trustline.isSuccess && trustline.data === true

  const transfer = phase.kind === 'waiting' || phase.kind === 'delivering' ? phase.transfer : null
  const attestation = useAttestation(network, transfer?.sourceDomain ?? null, transfer?.id ?? null)

  const titleId = useId()
  const busy = phase.kind === 'approving' || phase.kind === 'burning' || phase.kind === 'delivering'

  useEffect(() => {
    if (!open) {
      setPhase({ kind: 'form' })
      setAmount('')
      setTl({ busy: false, error: null })
      setDeclined(false)
      return
    }
    if (resume) setPhase({ kind: 'waiting', transfer: resume })
  }, [open, resume])

  // another network means other contracts, so start over. not on mount, where
  // it would drop a transfer the page asked to resume
  const lastNetwork = useRef(network)
  useEffect(() => {
    if (lastNetwork.current === network) return
    lastNetwork.current = network
    setChainKey(cctpChainsFor(network)[0]?.key ?? '')
    setPhase({ kind: 'form' })
  }, [network])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  // keyboard and screen reader users otherwise stay on the button behind the overlay
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogRef.current?.focus()
    return () => before?.focus()
  }, [open])

  // aria-modal tells a screen reader the page behind is out of reach, so Tab wraps
  // around the dialog instead of wandering onto that page
  const keepTabInside = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !dialogRef.current) return
    const items = dialogRef.current.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const at = document.activeElement
    if (e.shiftKey && (at === first || at === dialogRef.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && at === last) {
      e.preventDefault()
      first.focus()
    }
  }

  let units: bigint | null = null
  let amountError: string | null = null
  try {
    units = amount ? toEvmUsdcUnits(amount) : null
  } catch (err) {
    // "0" and a 7th decimal each get their own reason, not a generic hint
    amountError = errorText(err)
  }

  const bps = finality === 'fast' ? (fees.data?.fastBps ?? null) : (fees.data?.standardBps ?? 0)
  // no fast tier offered: block it and ask for standard rather than guess a fee
  const fastUnavailable = finality === 'fast' && fees.isSuccess && fees.data.fastBps === null
  const maxFee = units !== null && bps !== null ? maxFeeFor(units, bps) : null
  const expectedFee = units !== null && bps !== null ? (units * BigInt(Math.ceil(bps * 100))) / 1_000_000n : null
  // the burn refuses a max fee that is not below the amount; caught here, before an approval is paid for
  const feeSwallows = units !== null && maxFee !== null && maxFee >= units

  const usdcBal = balances.data?.usdc ?? null
  const gasBal = balances.data?.gas ?? null
  const overBalance = units !== null && usdcBal !== null && units > usdcBal
  const noGas = gasBal === 0n

  if (!open) return null

  const handleTrustline = async () => {
    if (!receiving || !usdcIssuer || tlInFlight.current) return
    tlInFlight.current = true
    setTl({ busy: true, error: null })
    try {
      const xdr = await buildTrustlineXdr(receiving, USDC, usdcIssuer, network)
      const signed = await (treasury ? custodySigner : walletKitSigner).signTransaction(xdr, {
        networkPassphrase: networkPassphrase(network),
        address: receiving,
      })
      // DFNS broadcasts a classic tx itself, after an approval when a policy holds it
      if (signed.pendingId) await awaitDfnsSignature(signed.pendingId, network)
      else if (signed.signedTxXdr) await submitTrustlineTx(signed.signedTxXdr, network)
      else if (!signed.broadcastHash) throw new Error('The wallet did not return a signed transaction')
      // wait for the ledger to show it, not just for the submit to return
      for (let i = 0; i < 10; i++) {
        if ((await trustline.refetch()).data === true) break
        await new Promise((r) => setTimeout(r, 2_000))
      }
      setTl({ busy: false, error: null })
    } catch (err) {
      setTl({ busy: false, error: errorText(err) })
    } finally {
      tlInFlight.current = false
    }
  }

  const handleBridge = async () => {
    if (!chain || !receiving || !evmAddr || units === null || maxFee === null || feeSwallows) return
    if (bridgeInFlight.current) return
    bridgeInFlight.current = true
    try {
      setDeclined(false)

      // again at the last moment, the trustline could have gone while the form sat open
      const fresh = await trustline.refetch()
      if (fresh.data !== true) {
        setPhase({ kind: 'failed', msg: 'Your Stellar account has no USDC trustline yet. Turn it on first.' })
        return
      }

      if (network === 'mainnet') {
        const ok = window.confirm(
          `Bridge ${amount} USDC from ${chain.name} to ${shortenAddress(receiving, 6, 4)} on mainnet.\n\nThis moves real funds. Continue?`,
        )
        if (!ok) return
      }

      try {
        // read now, not from the cache: after a declined burn the cached value predates the approval
        // just made, and a stale zero would ask for a second one
        const allowance = await readAllowance(chain, evmAddr).catch(() => balances.data?.allowance ?? 0n)
        if (allowance < units) {
          setPhase({ kind: 'approving' })
          await approveUsdc(chain, units)
        }
        setPhase({ kind: 'burning' })
        // tracked the moment the burn leaves the wallet: when its receipt is slow to come back,
        // the transfer must not vanish from the page while Circle is already on it
        const sent: { transfer: TrackedTransfer | null } = { transfer: null }
        try {
          await burnToStellar(
            {
              chain,
              units,
              recipient: receiving,
              forwarder: CONTRACTS[network].cctp.forwarder,
              maxFee,
              finality,
            },
            (hash) => {
              sent.transfer = {
                id: hash,
                network,
                chainKey: chain.key,
                chainName: chain.name,
                sourceDomain: chain.domain,
                amount,
                recipient: receiving,
                finality,
                createdAt: Date.now(),
                stage: 'burned',
              }
              trackTransfer(sent.transfer)
            },
          )
        } catch (err) {
          // a receipt nobody could read is not a failed burn: Circle's signature settles it
          if (!(err instanceof ReceiptUnreadError) || !sent.transfer) {
            // a burn reverted on chain moved nothing; stop tracking it
            if (sent.transfer) forgetTransfer(network, sent.transfer.id)
            throw err
          }
        }
        if (!sent.transfer) throw new Error('The burn went out without a hash')
        setPhase({ kind: 'waiting', transfer: sent.transfer })
        void balances.refetch()
      } catch (err) {
        if (err instanceof UserRejectedError) {
          setPhase({ kind: 'form' })
          setDeclined(true)
          return
        }
        setPhase({ kind: 'failed', msg: errorText(err) })
      }
    } finally {
      bridgeInFlight.current = false
    }
  }

  // the arrivals list and the balances behind the modal were read before the USDC landed
  const refreshRecipient = (recipient: string) => {
    void qc.invalidateQueries({ queryKey: ['activity', network, recipient] })
    void qc.invalidateQueries({ queryKey: ['horizon', 'balances', network, recipient] })
  }

  const handleDeliver = async (t: TrackedTransfer) => {
    if (deliverInFlight.current) return
    deliverInFlight.current = true
    try {
      const att = attestation.data
      if (!stellarAddr || !att || att.state !== 'complete') return
      setPhase({ kind: 'delivering', transfer: t })
      try {
        const check = await checkClaim(network, att.message, att.attestation, t.recipient, t.sourceDomain)
        if (!check.ok) {
          if (check.reason === 'already-claimed') {
            markDelivered(network, t.id, '')
            refreshRecipient(t.recipient)
            setPhase({ kind: 'done', transfer: t, deliveredHash: null })
            return
          }
          const why = {
            expired:
              "Circle's signature on this transfer has expired. Nothing is lost, the burn is on chain, but it needs a fresh attestation from Circle before it can be delivered.",
            'no-trustline': 'The receiving account has no USDC trustline. Turn it on, then deliver again.',
            paused: 'Circle has paused deliveries on Stellar for now. Your transfer is saved, finish it later from the Bridges page.',
          }[check.reason]
          setPhase({ kind: 'failed', msg: why, transfer: t })
          return
        }
        const res = await claimOnStellar({
          network,
          payer: stellarAddr,
          signer: walletKitSigner,
          messageHex: att.message,
          attestationHex: att.attestation,
        })
        markDelivered(network, t.id, res.hash)
        refreshRecipient(t.recipient)
        setPhase({ kind: 'done', transfer: t, deliveredHash: res.hash })
      } catch (err) {
        const msg = errorText(err)
        setPhase({
          kind: 'failed',
          msg: /declin|reject|denied|cancel/i.test(msg)
            ? 'You declined the signature in your wallet. The transfer is saved, deliver it whenever you are ready.'
            : msg,
          transfer: t,
        })
      }
    } finally {
      deliverInFlight.current = false
    }
  }

  const canBridge =
    !!chain &&
    !!receiving &&
    !!evmAddr &&
    units !== null &&
    maxFee !== null &&
    !fastUnavailable &&
    !feeSwallows &&
    // the balance and gas checks only bite once the balance is in; on a slow line
    // Circle's fee can arrive first and unlock the button without them
    !balances.isLoading &&
    !overBalance &&
    !noGas &&
    trustlineOk &&
    !busy

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => !busy && onClose()}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative bg-bg-card rounded-3xl p-6 w-full max-w-md mx-4 max-h-[92vh] overflow-y-auto outline-none"
        style={{ border: '1px solid rgba(13, 45, 76, 0.1)', boxShadow: '0 25px 60px rgba(8, 10, 12, 0.15)' }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={keepTabInside}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 id={titleId} className="text-lg font-semibold text-text">
            Bridge USDC to Stellar
          </h3>
          <button
            onClick={() => !busy && onClose()}
            disabled={busy}
            aria-label="Close bridge"
            className="text-text-muted hover:text-text disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <X size={18} />
          </button>
        </div>

        {phase.kind === 'done' ? (
          <Done phase={phase} network={network} onClose={onClose} />
        ) : phase.kind === 'failed' ? (
          <div className="text-center py-4">
            <p className="text-sm text-text mb-2 font-medium">That did not go through</p>
            <p className="text-sm text-text-secondary mb-5 break-words">{phase.msg}</p>
            <button
              onClick={() => setPhase(phase.transfer ? { kind: 'waiting', transfer: phase.transfer } : { kind: 'form' })}
              className="px-6 py-2 rounded-full bg-primary text-white text-sm font-medium"
            >
              {phase.transfer ? 'Back to the transfer' : 'Back'}
            </button>
          </div>
        ) : phase.kind === 'waiting' || phase.kind === 'delivering' ? (
          <InFlight
            transfer={phase.transfer}
            network={network}
            delivering={phase.kind === 'delivering'}
            ready={attestation.data?.state === 'complete'}
            delayReason={attestation.data?.state === 'pending' ? attestation.data.delayReason : null}
            attestationError={attestation.isError ? errorText(attestation.error) : null}
            canSign={!!stellarAddr}
            toTreasury={!!treasury}
            onDeliver={() => handleDeliver(phase.transfer)}
          />
        ) : (
          <>
            <Section label="From">
              <div className="grid grid-cols-3 gap-2">
                {chains.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => setChainKey(c.key)}
                    aria-pressed={chain?.key === c.key}
                    disabled={busy}
                    className={cn(
                      'px-2 py-2.5 rounded-xl text-xs font-medium transition-all',
                      chain?.key === c.key
                        ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                        : 'bg-bg text-text-secondary hover:bg-bg/80',
                    )}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </Section>

            <div className="mb-4 px-3 py-2.5 rounded-xl bg-bg text-xs space-y-2">
              <div className="flex justify-between items-center gap-2">
                <span className="text-text-secondary">Sending wallet</span>
                {evmAddr ? (
                  <span className="flex items-center gap-2 text-text font-mono">
                    {shortenAddress(evmAddr, 6, 4)}
                    <button onClick={() => disconnect()} className="text-[10px] text-text-muted hover:text-coral">
                      disconnect
                    </button>
                  </span>
                ) : (
                  <div className="flex gap-1 flex-wrap justify-end">
                    {walletOptions.map((c) => (
                      <button
                        key={c.uid}
                        onClick={() => connect({ connector: c })}
                        disabled={isConnecting}
                        className="px-2 py-1 rounded-md bg-primary text-white text-[11px] font-medium disabled:opacity-50"
                      >
                        {c.id === 'injected' ? 'Browser wallet' : c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {connectError && !evmAddr && (
                <p className="text-[10px] text-coral">{readableConnectError(connectError.message)}</p>
              )}
              {evmAddr && chain && (
                <div className="flex justify-between text-text-secondary">
                  <span>On {chain.name}</span>
                  <span className="text-text">
                    {balances.isLoading
                      ? '...'
                      : usdcBal !== null
                        ? `${fmtUsdc(usdcBal)} USDC`
                        : 'balance unavailable'}
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center gap-2">
                <span className="text-text-secondary">Receiving account</span>
                <span className="text-text font-mono">
                  {receiving ? shortenAddress(receiving, 6, 4) : 'connect a Stellar wallet'}
                  {treasury && (
                    <>
                      {' '}
                      <span className="font-sans text-[10px] text-text-muted">DFNS treasury</span>
                    </>
                  )}
                </span>
              </div>
            </div>

            <Section
              label="Amount (USDC)"
              aside={
                usdcBal !== null && usdcBal > 0n ? (
                  <button
                    type="button"
                    onClick={() => setAmount(formatUnits(usdcBal, CCTP_EVM_USDC_DECIMALS))}
                    className="text-[11px] text-primary hover:underline"
                  >
                    Max {fmtUsdc(usdcBal)}
                  </button>
                ) : null
              }
            >
              <input
                type="text"
                inputMode="decimal"
                aria-label="Amount in USDC"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(',', '.'))}
                placeholder="0.00"
                className="w-full px-4 py-3 rounded-xl bg-bg text-text text-sm outline-none focus:ring-1 focus:ring-primary/30"
                style={{ border: '1px solid rgba(13, 45, 76, 0.08)' }}
              />
              {amount && amountError && <p className="text-[11px] text-coral mt-1">{amountError}.</p>}
              {feeSwallows && (
                <p className="text-[11px] text-coral mt-1">
                  Too small to cover Circle's fast fee. Send a little more, or pick standard.
                </p>
              )}
              {overBalance && chain && (
                <p className="text-[11px] text-coral mt-1">More than the USDC this wallet holds on {chain.name}.</p>
              )}
            </Section>

            <Section label="Speed">
              <div className="grid grid-cols-2 gap-2">
                {(['fast', 'standard'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFinality(f)}
                    aria-pressed={finality === f}
                    className={cn(
                      'px-3 py-2 rounded-xl text-xs text-left transition-all',
                      finality === f ? 'bg-primary/10 text-primary ring-1 ring-primary/30' : 'bg-bg text-text-secondary',
                    )}
                  >
                    <span className="font-medium block">{f === 'fast' ? 'Fast' : 'Standard'}</span>
                    <span className="text-[10px] text-text-muted">
                      {f === 'fast'
                        ? fees.data?.fastBps != null
                          ? `about a minute, ${fees.data.fastBps} bps`
                          : 'about a minute'
                        : 'free, waits for finality'}
                    </span>
                  </button>
                ))}
              </div>
              {fastUnavailable && (
                <p className="text-[11px] text-coral mt-1">Circle offers no fast route from here right now. Pick standard.</p>
              )}
              {finality === 'fast' && fees.isError && (
                <p className="text-[11px] text-coral mt-1">
                  Could not read Circle's fast fee just now, so fast is off. Standard needs no fee.
                </p>
              )}
            </Section>

            <div className="mb-4 px-3 py-2.5 rounded-xl bg-primary/5 text-xs text-text-secondary space-y-1.5">
              <Row label="Carried by" value="Circle CCTP" />
              <Row
                label="Circle fee"
                value={
                  expectedFee !== null
                    ? expectedFee === 0n
                      ? 'none'
                      : `about ${fmtUsdc(expectedFee)} USDC`
                    : fees.isLoading
                      ? '...'
                      : '-'
                }
              />
              <Row
                label="You receive"
                value={units !== null && expectedFee !== null ? `about ${fmtUsdc(units - expectedFee)} USDC` : '-'}
              />
              <div className="flex justify-between items-center">
                <span className="flex items-center gap-1">
                  Trustline <InfoTip term="trustline" label="a trustline" />
                </span>
                {!receiving ? (
                  <span className="text-text-muted">connect first</span>
                ) : trustline.isLoading ? (
                  <span className="text-text-muted">checking...</span>
                ) : trustlineOk ? (
                  <span className="text-green font-medium">on</span>
                ) : (
                  <button
                    onClick={handleTrustline}
                    disabled={tl.busy}
                    className="text-coral font-medium underline disabled:opacity-50"
                  >
                    {tl.busy ? 'turning on...' : 'turn it on'}
                  </button>
                )}
              </div>
              {tl.error && <p className="text-coral break-words pt-1">{tl.error}</p>}
            </div>

            {evmAddr && noGas && chain && (
              <Hint>
                This wallet has no gas on {chain.name}, so it cannot send the burn.
                {network === 'testnet' && ' Test gas is free from a faucet for that chain.'}
              </Hint>
            )}
            {evmAddr && usdcBal === 0n && network === 'testnet' && (
              <Hint>
                No test USDC on {chain?.name} yet.{' '}
                <a
                  href={BRIDGE_FALLBACK_LINKS.circleFaucet}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Circle's faucet
                </a>{' '}
                hands it out for free.
              </Hint>
            )}
            {!receiving && <Hint>Connect a Stellar wallet first. The USDC lands in that account.</Hint>}

            <button
              onClick={handleBridge}
              disabled={!canBridge}
              className="w-full py-3 rounded-full bg-primary text-white font-semibold text-sm transition-all hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {phase.kind === 'approving'
                ? 'Approving USDC...'
                : phase.kind === 'burning'
                  ? 'Sending the burn...'
                  : units !== null
                    ? `Bridge ${amount} USDC`
                    : 'Bridge'}
            </button>
            {declined && (
              <p className="text-[11px] text-text-secondary mt-2 text-center">
                You declined in your wallet, so the USDC did not move.
              </p>
            )}
            {phase.kind === 'burning' && chain && (
              // Rabby reads the Stellar account in the hook as an EVM address and calls it unknown
              <p className="text-[11px] text-text-secondary mt-2 text-center">
                Your wallet may flag the receiver as an unknown address: it reads the Stellar account in the burn as
                an EVM one. The contract you sign with is Circle&apos;s, {shortenAddress(chain.tokenMessenger, 6, 4)}.
              </p>
            )}
            <p className="text-[10px] text-text-muted mt-2 text-center">
              Two wallets sign: the EVM one sends the USDC, the Stellar one collects it.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function Section({ label, aside, children }: { label: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-text-secondary font-medium">{label}</span>
        {aside}
      </div>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className="text-text">{value}</span>
    </div>
  )
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-xs text-text-secondary">{children}</p>
}

// Circle's reasons for holding a fast transfer. Each ends the same way: Circle
// signs it as a standard transfer once the source chain finalises
const DELAY_REASONS: Record<string, string> = {
  insufficient_fee: 'the fast fee rose above what the burn allowed',
  amount_above_max: 'the amount is above what Circle carries fast',
  insufficient_allowance_available: "Circle's fast allowance is used up for now",
}

// past this, a fast transfer is no longer behaving like one
const FAST_SLOW_AFTER_MS = 3 * 60_000

function InFlight({
  transfer,
  network,
  delivering,
  ready,
  delayReason,
  attestationError,
  canSign,
  toTreasury,
  onDeliver,
}: {
  transfer: TrackedTransfer
  network: 'testnet' | 'mainnet'
  delivering: boolean
  ready: boolean
  delayReason: string | null
  attestationError: string | null
  canSign: boolean
  // the USDC goes to a DFNS treasury, and a browser wallet only pays the delivery
  toTreasury: boolean
  onDeliver: () => void
}) {
  const chain = cctpChainsFor(network).find((c) => c.key === transfer.chainKey)
  // which transfer has overrun its fast window; keyed by burn time so a resumed
  // transfer never inherits the note of the one before it
  const [slowFor, setSlowFor] = useState<number | null>(null)
  useEffect(() => {
    if (transfer.finality !== 'fast' || ready) return
    const timer = setTimeout(
      () => setSlowFor(transfer.createdAt),
      Math.max(0, transfer.createdAt + FAST_SLOW_AFTER_MS - Date.now()),
    )
    return () => clearTimeout(timer)
  }, [transfer.createdAt, transfer.finality, ready])
  const slow = slowFor === transfer.createdAt
  const steps = [
    { label: `Burned on ${transfer.chainName}`, done: true },
    { label: 'Signed by Circle', done: ready },
    { label: 'Delivered on Stellar', done: false },
  ]
  return (
    <div>
      <p className="text-sm text-text mb-4">
        {transfer.amount} USDC from {transfer.chainName} to {shortenAddress(transfer.recipient, 6, 4)}
      </p>
      <ol className="space-y-2.5 mb-5">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-center gap-3 text-xs">
            <span
              className={cn(
                'shrink-0 h-5 w-5 rounded-full flex items-center justify-center text-[10px]',
                s.done ? 'bg-green/15 text-green' : 'bg-bg text-text-secondary',
              )}
            >
              {s.done ? <Check size={12} /> : i + 1}
            </span>
            <span className={s.done ? 'text-text' : 'text-text-secondary'}>{s.label}</span>
          </li>
        ))}
      </ol>

      {chain && (
        <a
          href={chain.explorerTx(transfer.id)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-primary hover:underline inline-flex items-center gap-1 mb-4"
        >
          Burn on {transfer.chainName} {shortenAddress(transfer.id, 6, 4)} <ExternalLink size={11} />
        </a>
      )}

      {!ready ? (
        <p className="text-xs text-text-secondary mb-4">
          Waiting for Circle to sign the burn.{' '}
          {transfer.finality === 'fast'
            ? 'A fast transfer usually takes under a minute.'
            : 'A standard transfer waits for the source chain to finalise, usually 15 to 30 minutes.'}{' '}
          You can close this, the Bridges page keeps track of it.
          {delayReason ? (
            <span className="block mt-1 text-coral">
              Circle is holding it: {DELAY_REASONS[delayReason] ?? delayReason.replace(/_/g, ' ')}. It will sign it as
              a standard transfer once {transfer.chainName} finalises, usually 15 to 30 minutes. Nothing is lost.
            </span>
          ) : (
            slow && (
              <span className="block mt-1">
                This is taking longer than a fast transfer should. When Circle cannot carry one fast, it signs it
                as a standard transfer once {transfer.chainName} finalises, usually 15 to 30 minutes. Nothing is lost.
              </span>
            )
          )}
          {attestationError && <span className="block mt-1 text-coral">{attestationError}</span>}
        </p>
      ) : (
        <p className="text-xs text-text-secondary mb-4">
          Circle has signed it. One signature on Stellar delivers the USDC and moves none of your funds. Your
          wallet shows the most the network fee could reach, a little over {INCLUSION_FEE_XLM} XLM; it usually
          comes to a few hundredths.
        </p>
      )}

      <button
        onClick={onDeliver}
        disabled={!ready || delivering || !canSign}
        className="w-full py-3 rounded-full bg-primary text-white font-semibold text-sm transition-all hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {delivering ? 'Delivering...' : ready ? 'Deliver on Stellar' : 'Waiting for Circle...'}
      </button>
      {!canSign && (
        <p className="text-[11px] text-coral mt-2">
          {toTreasury
            ? 'Connect any Stellar wallet to pay the delivery. It only pays the network fee; the USDC goes to the treasury.'
            : 'Connect a Stellar wallet to deliver.'}
        </p>
      )}
      <p className="text-[10px] text-text-muted mt-2">
        {network === 'testnet' ? 'Testnet. Test USDC, no real value.' : 'Mainnet. Real USDC.'}
      </p>
    </div>
  )
}

function Done({
  phase,
  network,
  onClose,
}: {
  phase: { transfer: TrackedTransfer; deliveredHash: string | null }
  network: 'testnet' | 'mainnet'
  onClose: () => void
}) {
  const chain = cctpChainsFor(network).find((c) => c.key === phase.transfer.chainKey)
  return (
    <div className="text-center py-4">
      <div className="w-12 h-12 rounded-full bg-green/10 flex items-center justify-center mx-auto mb-4">
        <Check className="text-green" size={22} />
      </div>
      <p className="text-lg font-semibold text-text mb-1">USDC delivered</p>
      <p className="text-sm text-text-secondary mb-4">
        {phase.transfer.amount} USDC from {phase.transfer.chainName}
        {phase.transfer.finality === 'fast' ? ", net of Circle's fee" : ', no fee on a standard transfer'}
      </p>
      <div className="flex flex-col gap-1.5 items-center text-xs mb-5">
        {chain && (
          <a
            href={chain.explorerTx(phase.transfer.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            Burn on {phase.transfer.chainName} {shortenAddress(phase.transfer.id, 6, 4)} <ExternalLink size={11} />
          </a>
        )}
        {phase.deliveredHash ? (
          <a
            href={stellarExplorer(network, 'tx', phase.deliveredHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            Delivery on Stellar {shortenAddress(phase.deliveredHash, 6, 4)} <ExternalLink size={11} />
          </a>
        ) : (
          <span className="text-text-muted">It had already been delivered.</span>
        )}
      </div>
      <button onClick={onClose} className="px-6 py-2 rounded-full bg-primary text-white text-sm font-medium">
        Done
      </button>
    </div>
  )
}
