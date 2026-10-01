import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { useAccount } from 'wagmi'

import { cn, shortenAddress, stellarExplorer } from '../utils/format'
import { useWallet } from '../contexts/WalletContext'
import { useCustody } from '../contexts/CustodyContext'
import { walletKitSigner } from '../integrations/signer/wallet-kit-signer'
import { useAccountBalances, useAccountExists } from '../integrations/horizon/account'
import { CONTRACTS, STELLAR_CCTP_DOMAIN, cctpChainsFor, type Network } from '../config/contracts'
import {
  approveForBurn,
  burnFromStellar,
  readStellarAllowance,
  sendableAmount,
  StellarBurnError,
  stellarBalanceUnits,
  stellarToEvmUnits,
  toStellarUsdcUnits,
} from '../integrations/cctp/stellar-burn'
import { isReceivedOnEvm, receiveOnEvm, ReceiptUnreadError, UserRejectedError } from '../integrations/cctp/evm-burn'
import { assertAttestation, assertEvmMessageMatches, decodeCctpMessage, hexToBytes } from '../integrations/cctp/message'
import { useAttestation, useForwardQuote, useReceivedOnEvm, useSourceBalances } from '../integrations/cctp/hooks'
import {
  forgetTransfer,
  markAttested,
  markDelivered,
  trackTransfer,
  useTrackedTransfers,
  type TrackedTransfer,
} from '../integrations/cctp/transfers'
import { fmtUsdc, stellarNetworkMismatch, useStellarWalletNetwork } from '../integrations/cctp/wallets'
import { circleMinted, elapsed, expectedDuration, statusOf, useNow } from '../integrations/cctp/status'
import { useOnScreen } from '../integrations/cctp/on-screen'
import { EvmConnectButtons } from './BridgeWallets'
import { StepList, type Step } from './BridgeProgress'

export type OutStage = 'form' | 'busy' | 'progress'

type Phase =
  | { kind: 'form' }
  | { kind: 'approving' }
  | { kind: 'burning' }
  | { kind: 'progress'; transfer: TrackedTransfer }
  | { kind: 'failed'; msg: string; transfer?: TrackedTransfer }

type Delivery = 'circle' | 'self'

function errorText(err: unknown): string {
  if (err instanceof Error) return err.message.split('\n')[0].slice(0, 300)
  return 'Something went wrong'
}

// past this with Circle's mint still pending, the wallet may take over; sooner
// would race Circle's own transaction
const FORWARD_SLOW_AFTER_MS = 5 * 60_000

export default function BridgeFromStellar({
  network,
  resume,
  onStage,
}: {
  network: Network
  resume: TrackedTransfer | null
  onStage: (stage: OutStage) => void
}) {
  const { address: stellarAddr, connect: connectStellar, connecting } = useWallet()
  const { mode: custodyMode } = useCustody()
  const chains = cctpChainsFor(network)
  const [chainKey, setChainKey] = useState(chains[0]?.key ?? '')
  const [amount, setAmount] = useState('')
  const [delivery, setDelivery] = useState<Delivery>('circle')
  const [phase, setPhase] = useState<Phase>(() => (resume ? { kind: 'progress', transfer: resume } : { kind: 'form' }))
  const [declined, setDeclined] = useState(false)
  // a double click lands twice before the phase change disables the button
  const inFlight = useRef(false)

  const chain = chains.find((c) => c.key === chainKey) ?? chains[0] ?? null
  const evm = useAccount()
  const evmAddr = evm.address

  const balances = useAccountBalances(network, stellarAddr)
  const exists = useAccountExists(network, stellarAddr)
  const { usdcIssuer } = CONTRACTS[network].cctp
  const usdcLine = balances.data?.find((b) => b.code === 'USDC' && b.issuer === usdcIssuer)
  const usdcUnits = usdcLine ? stellarBalanceUnits(usdcLine.balance) : balances.isSuccess ? 0n : null
  const xlmLine = balances.data?.find((b) => b.isNative)
  const quote = useForwardQuote(network, delivery === 'circle' ? chain : null)
  // the mint on the EVM side is paid in gas by whoever submits it
  const dest = useSourceBalances(delivery === 'self' ? chain : null, evmAddr)
  const walletNet = useStellarWalletNetwork(stellarAddr)
  const mismatch = stellarNetworkMismatch(network, walletNet.data)

  const stage: OutStage =
    phase.kind === 'approving' || phase.kind === 'burning' ? 'busy' : phase.kind === 'form' ? 'form' : 'progress'
  useEffect(() => onStage(stage), [stage, onStage])

  if (phase.kind === 'progress') {
    return <OutProgress network={network} transfer={phase.transfer} onStage={onStage} />
  }
  if (phase.kind === 'failed') {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-text mb-2 font-medium">That did not go through</p>
        <p className="text-sm text-text-secondary mb-5 break-words">{phase.msg}</p>
        <button
          onClick={() => setPhase(phase.transfer ? { kind: 'progress', transfer: phase.transfer } : { kind: 'form' })}
          className="px-6 py-2 rounded-full bg-primary text-white text-sm font-medium"
        >
          {phase.transfer ? 'Back to the transfer' : 'Back'}
        </button>
      </div>
    )
  }

  let units: bigint | null = null
  let amountError: string | null = null
  try {
    units = amount ? toStellarUsdcUnits(amount) : null
  } catch (err) {
    amountError = errorText(err)
  }
  const units6 = units !== null ? stellarToEvmUnits(units) : null
  // Circle keeps the whole fee when it mints for you, so the quote is the price
  const fee6 =
    delivery === 'self'
      ? 0n
      : quote.data && units6 !== null
        ? quote.data.fee + (units6 * BigInt(Math.ceil(quote.data.bps * 100))) / 1_000_000n
        : null
  const maxFee = fee6 !== null ? fee6 * 10n : null
  const feeSwallows = units !== null && maxFee !== null && maxFee >= units
  const overBalance = units !== null && usdcUnits !== null && units > usdcUnits
  const noXlm = exists === 'missing' || (!!xlmLine && Number(xlmLine.balance) === 0)
  const noDestGas = delivery === 'self' && dest.data?.gas === 0n
  const busy = phase.kind === 'approving' || phase.kind === 'burning'

  const canSend =
    !!chain &&
    !!stellarAddr &&
    !!evmAddr &&
    units !== null &&
    maxFee !== null &&
    !feeSwallows &&
    !overBalance &&
    !noXlm &&
    !noDestGas &&
    !mismatch &&
    !balances.isLoading &&
    !busy

  const handleSend = async () => {
    if (!chain || !stellarAddr || !evmAddr || units === null || maxFee === null || feeSwallows) return
    if (inFlight.current) return
    inFlight.current = true
    const sent: { transfer: TrackedTransfer | null } = { transfer: null }
    try {
      setDeclined(false)
      if (network === 'mainnet') {
        const ok = window.confirm(
          `Send ${amount} USDC from Stellar (${shortenAddress(stellarAddr, 6, 4)}) to ${shortenAddress(evmAddr, 6, 4)} on ${chain.name}, mainnet.\n\nThis moves real funds. Continue?`,
        )
        if (!ok) return
      }
      // read now, not from a cache: a declined burn after an approval leaves an allowance to reuse
      const allowance = await readStellarAllowance(network, stellarAddr).catch(() => 0n)
      if (allowance < units) {
        setPhase({ kind: 'approving' })
        await approveForBurn({ network, owner: stellarAddr, units, signer: walletKitSigner })
      }
      setPhase({ kind: 'burning' })
      await burnFromStellar(
        {
          network,
          owner: stellarAddr,
          units,
          chain,
          evmRecipient: evmAddr,
          forward: delivery === 'circle',
          maxFee,
          signer: walletKitSigner,
        },
        (hash) => {
          // tracked the moment Stellar has it: a confirmation slow to come back must
          // not hide a burn Circle is already reading
          sent.transfer = {
            id: hash,
            direction: 'from-stellar',
            network,
            chainKey: chain.key,
            chainName: chain.name,
            sourceDomain: STELLAR_CCTP_DOMAIN,
            amount,
            recipient: evmAddr,
            finality: 'standard',
            forwarded: delivery === 'circle',
            createdAt: Date.now(),
            stage: 'burned',
          }
          trackTransfer(sent.transfer)
        },
      )
      if (!sent.transfer) throw new StellarBurnError('The burn went out without a hash')
      setPhase({ kind: 'progress', transfer: sent.transfer })
      void balances.refetch()
    } catch (err) {
      if (err instanceof UserRejectedError) {
        setPhase({ kind: 'form' })
        setDeclined(true)
        return
      }
      const t = sent.transfer
      // Stellar ran it and refused: nothing was burned, so nothing to follow
      if (t && err instanceof StellarBurnError && /failed on Stellar/.test(err.message)) {
        forgetTransfer(network, t.id)
        setPhase({ kind: 'failed', msg: errorText(err) })
        return
      }
      // submitted, then no word back: Circle's view settles whether it burned
      setPhase({ kind: 'failed', msg: errorText(err), transfer: t ?? undefined })
    } finally {
      inFlight.current = false
    }
  }

  return (
    <>
      <Section label="To">
        <div className="grid grid-cols-3 gap-2">
          {chains.map((c) => (
            <button
              key={c.key}
              onClick={() => setChainKey(c.key)}
              aria-pressed={chain?.key === c.key}
              disabled={busy}
              className={cn(
                'px-2 py-2.5 rounded-xl text-xs font-medium transition-all',
                chain?.key === c.key ? 'bg-primary/10 text-primary ring-1 ring-primary/30' : 'bg-bg text-text-secondary hover:bg-bg/80',
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      </Section>

      <div className="mb-4 px-3 py-2.5 rounded-xl bg-bg text-xs space-y-2">
        <div className="flex justify-between items-center gap-2">
          <span className="text-text-secondary">Sending account</span>
          {stellarAddr ? (
            <span className="text-text font-mono">{shortenAddress(stellarAddr, 6, 4)}</span>
          ) : (
            <button
              onClick={connectStellar}
              disabled={connecting}
              className="px-2 py-1 rounded-md bg-primary text-white text-[11px] font-medium disabled:opacity-50"
            >
              {connecting ? 'Connecting...' : 'Connect a Stellar wallet'}
            </button>
          )}
        </div>
        {stellarAddr && (
          <div className="flex justify-between text-text-secondary">
            <span>On Stellar</span>
            <span className="text-text">
              {balances.isLoading
                ? '...'
                : usdcUnits !== null
                  ? `${fmtUsdc(usdcUnits, 7)} USDC, ${xlmLine ? Number(xlmLine.balance).toLocaleString('en-US', { maximumFractionDigits: 2 }) : '0'} XLM`
                  : 'balance unavailable'}
            </span>
          </div>
        )}
        {mismatch && <p className="text-[10px] text-coral">{mismatch}</p>}
        <div className="flex justify-between items-center gap-2">
          <span className="text-text-secondary">Receiving wallet</span>
          {evmAddr ? (
            <span className="text-text font-mono">{shortenAddress(evmAddr, 6, 4)}</span>
          ) : (
            <EvmConnectButtons small />
          )}
        </div>
        {evmAddr && chain && (
          <div className="flex justify-between text-text-secondary">
            <span>Lands on</span>
            <span className="text-text">{chain.name}</span>
          </div>
        )}
      </div>

      <Section
        label="Amount (USDC)"
        aside={
          usdcUnits !== null && usdcUnits >= 10n ? (
            <button
              type="button"
              onClick={() => setAmount(sendableAmount(usdcUnits))}
              className="text-[11px] text-primary hover:underline"
            >
              Max {sendableAmount(usdcUnits)}
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
        {overBalance && <p className="text-[11px] text-coral mt-1">More than the USDC this Stellar account holds.</p>}
        {feeSwallows && (
          <p className="text-[11px] text-coral mt-1">
            Too small to cover Circle&apos;s delivery fee. Send more, or receive it yourself.
          </p>
        )}
      </Section>

      <Section label={chain ? `Delivery on ${chain.name}` : 'Delivery'}>
        <div className="grid grid-cols-2 gap-2">
          {(['circle', 'self'] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDelivery(d)}
              aria-pressed={delivery === d}
              disabled={busy}
              className={cn(
                'px-3 py-2 rounded-xl text-xs text-left transition-all',
                delivery === d ? 'bg-primary/10 text-primary ring-1 ring-primary/30' : 'bg-bg text-text-secondary',
              )}
            >
              <span className="font-medium block">{d === 'circle' ? 'Circle delivers it' : 'I receive it myself'}</span>
              <span className="text-[10px] text-text-muted">
                {d === 'circle'
                  ? quote.data
                    ? `${fmtUsdc(quote.data.fee)} USDC fee, nothing to sign there`
                    : 'a small USDC fee, nothing to sign there'
                  : 'no Circle fee, your EVM wallet pays the gas'}
              </span>
            </button>
          ))}
        </div>
        {delivery === 'circle' && quote.isError && (
          <p className="text-[11px] text-coral mt-1">
            Could not read Circle&apos;s delivery fee just now. Try again, or receive it yourself.
          </p>
        )}
        {noDestGas && chain && (
          <p className="text-[11px] text-coral mt-1">
            This EVM wallet has no gas on {chain.name} to receive it. Let Circle deliver it, or add a little ETH on{' '}
            {chain.name}.
          </p>
        )}
      </Section>

      <div className="mb-4 px-3 py-2.5 rounded-xl bg-primary/5 text-xs text-text-secondary space-y-1.5">
        <Row label="Carried by" value="Circle CCTP" />
        <Row
          label="Circle fee"
          value={
            delivery === 'self'
              ? 'none'
              : fee6 !== null
                ? `${fmtUsdc(fee6)} USDC, taken from the amount`
                : quote.isLoading
                  ? '...'
                  : '-'
          }
        />
        <Row
          label="You receive"
          value={units6 !== null && fee6 !== null && units6 > fee6 ? `${fmtUsdc(units6 - fee6)} USDC on ${chain?.name ?? ''}` : '-'}
        />
        <Row label="Time" value={delivery === 'circle' ? 'about a minute' : 'about a minute, then your signature'} />
      </div>

      {!stellarAddr && <Hint>Connect the Stellar wallet that holds the USDC.</Hint>}
      {stellarAddr && !evmAddr && <Hint>Connect the EVM wallet that should receive the USDC.</Hint>}
      {noXlm && stellarAddr && (
        <Hint>This Stellar account needs a little XLM for the network fees of the two signatures.</Hint>
      )}
      {custodyMode === 'dfns' && (
        <Hint>
          The DFNS treasury cannot send from here: its relay signs deliveries into it, not burns out of it. This sends
          from the connected browser wallet.
        </Hint>
      )}

      <button
        onClick={handleSend}
        disabled={!canSend}
        className="w-full py-3 rounded-full bg-primary text-white font-semibold text-sm transition-all hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {phase.kind === 'approving'
          ? 'Approving USDC...'
          : phase.kind === 'burning'
            ? 'Sending the burn...'
            : units !== null && chain
              ? `Send ${amount} USDC to ${chain.name}`
              : 'Send'}
      </button>
      {declined && (
        <p className="text-[11px] text-text-secondary mt-2 text-center">
          You declined in your wallet, so the USDC did not move.
        </p>
      )}
      <p className="text-[10px] text-text-muted mt-2 text-center">
        Your Stellar wallet signs twice: an approval for this exact amount, then the burn.
        {delivery === 'self' && ' Your EVM wallet signs once more to receive it.'}
      </p>
    </>
  )
}

function OutProgress({
  network,
  transfer: started,
  onStage,
}: {
  network: Network
  transfer: TrackedTransfer
  onStage: (stage: OutStage) => void
}) {
  // the saved copy, so the times recorded below and another tab finishing it both show
  const transfer = useTrackedTransfers(network).find((t) => t.id === started.id) ?? started
  useOnScreen(transfer.id)
  const qc = useQueryClient()
  const chain = cctpChainsFor(network).find((c) => c.key === transfer.chainKey) ?? null
  const evm = useAccount()
  const att = useAttestation(network, STELLAR_CCTP_DOMAIN, transfer.id, {
    destinationDomain: chain?.domain,
    untilForwarded: !!transfer.forwarded,
  })
  const [local, setLocal] = useState<{ deliveredHash: string | null; already: boolean } | null>(null)
  const [receiving, setReceiving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  const data = att.data
  const nonce = (() => {
    if (data?.state !== 'complete') return null
    try {
      return decodeCctpMessage(hexToBytes(data.message)).nonce
    } catch {
      return null
    }
  })()
  // the chain itself says when the message has been received, whatever Circle's labels say
  const onChain = useReceivedOnEvm(chain, transfer.stage !== 'delivered' && local === null ? nonce : null)
  const settled = transfer.stage === 'delivered' || local !== null || onChain.data === true
  const status = settled ? ({ kind: 'delivered' } as const) : statusOf(transfer, data)
  const now = useNow(status.kind !== 'delivered')

  useEffect(() => onStage(receiving ? 'busy' : 'progress'), [receiving, onStage])

  // when Circle signed and when it minted, kept on the transfer for the list and a reload
  useEffect(() => {
    if (data?.state !== 'complete') return
    markAttested(network, transfer.id)
    const minted = (transfer.forwarded && circleMinted(data.forwardState)) || onChain.data === true
    if (minted && transfer.stage !== 'delivered' && local === null) {
      markDelivered(network, transfer.id, data.forwardTxHash ?? '')
      void qc.invalidateQueries({ queryKey: ['cctp', 'holdings'] })
    }
    // the chain can say it landed before Circle names its own mint; the hash follows
    if (transfer.forwarded && transfer.stage === 'delivered' && !transfer.deliveredHash && data.forwardTxHash) {
      markDelivered(network, transfer.id, data.forwardTxHash)
    }
  }, [data, onChain.data, network, transfer.id, transfer.forwarded, transfer.stage, transfer.deliveredHash, local, qc])

  const fee = (() => {
    if (data?.state !== 'complete') return null
    try {
      return decodeCctpMessage(hexToBytes(data.message)).body.feeExecuted
    } catch {
      return null
    }
  })()

  const mintHash = local?.deliveredHash ?? transfer.deliveredHash ?? (data?.state === 'complete' ? data.forwardTxHash : null)
  const attestedAt = transfer.attestedAt
  const circleSlow =
    !!transfer.forwarded &&
    status.kind === 'circle-minting' &&
    !!transfer.attestedAt &&
    now - transfer.attestedAt > FORWARD_SLOW_AFTER_MS

  const handleReceive = async () => {
    if (!chain || data?.state !== 'complete' || inFlight.current) return
    inFlight.current = true
    setReceiving(true)
    setError(null)
    try {
      const msg = decodeCctpMessage(hexToBytes(data.message))
      assertEvmMessageMatches(msg, {
        sourceDomain: STELLAR_CCTP_DOMAIN,
        destinationDomain: chain.domain,
        recipient: transfer.recipient,
      })
      assertAttestation(hexToBytes(data.attestation))
      if (await isReceivedOnEvm(chain, msg.nonce)) {
        markDelivered(network, transfer.id, '')
        setLocal({ deliveredHash: null, already: true })
        return
      }
      const hash = await receiveOnEvm(chain, data.message, data.attestation)
      markDelivered(network, transfer.id, hash)
      setLocal({ deliveredHash: hash, already: false })
      void qc.invalidateQueries({ queryKey: ['cctp', 'holdings'] })
    } catch (err) {
      if (err instanceof UserRejectedError) {
        setError('You declined in your wallet. The transfer is saved, receive it whenever you are ready.')
      } else if (err instanceof ReceiptUnreadError) {
        setError(`Sent (${shortenAddress(err.hash, 6, 4)}), but its confirmation could not be read yet. Check it on the explorer before sending again.`)
      } else {
        setError(errorText(err))
      }
    } finally {
      inFlight.current = false
      setReceiving(false)
    }
  }

  const steps: Step[] = [
    {
      label: 'Burned on Stellar',
      done: true,
      at: transfer.createdAt,
      link: { href: stellarExplorer(network, 'tx', transfer.id), text: `Burn on Stellar ${shortenAddress(transfer.id, 6, 4)}` },
    },
    {
      label: 'Signed by Circle',
      done: data?.state === 'complete' || status.kind === 'delivered',
      current: status.kind === 'waiting-circle',
      at: attestedAt,
    },
    {
      label: transfer.forwarded ? `Minted on ${transfer.chainName} by Circle` : `Received on ${transfer.chainName}`,
      done: status.kind === 'delivered',
      current: status.kind === 'circle-minting' || status.kind === 'ready-receive',
      at: transfer.deliveredAt,
      link:
        mintHash && chain
          ? { href: chain.explorerTx(mintHash), text: `Mint on ${transfer.chainName} ${shortenAddress(mintHash, 6, 4)}` }
          : undefined,
    },
  ]

  if (status.kind === 'delivered') {
    return (
      <div className="text-center py-2">
        <div className="w-12 h-12 rounded-full bg-green/10 flex items-center justify-center mx-auto mb-4">
          <Check className="text-green" size={22} />
        </div>
        <p className="text-lg font-semibold text-text mb-1">USDC arrived on {transfer.chainName}</p>
        <p className="text-sm text-text-secondary mb-4">
          {transfer.amount} USDC from Stellar
          {fee !== null && fee > 0n ? `, less Circle's ${fmtUsdc(fee)} USDC delivery fee` : ', no fee'}
          {local?.already && '. It had already been received.'}
        </p>
        <div className="text-left">
          <StepList steps={steps} />
        </div>
      </div>
    )
  }

  return (
    <div>
      <p className="text-sm text-text mb-1">
        {transfer.amount} USDC from Stellar to {shortenAddress(transfer.recipient, 6, 4)} on {transfer.chainName}
      </p>
      <p className="text-[11px] text-text-muted mb-4">
        Started {elapsed(transfer.createdAt, now)} ago; {expectedDuration(transfer)}.
      </p>
      <StepList steps={steps} />

      {status.kind === 'waiting-circle' && (
        <p className="text-xs text-text-secondary mb-4">
          Waiting for Circle to sign the burn. You can close this, the Bridges page keeps track of it.
          {att.isError && <span className="block mt-1 text-coral">{errorText(att.error)}</span>}
        </p>
      )}
      {status.kind === 'circle-minting' && (
        <p className="text-xs text-text-secondary mb-4">
          Circle has signed it and is minting the USDC on {transfer.chainName} itself. Nothing to sign.
          {circleSlow && (
            <span className="block mt-1">
              This is taking longer than usual. Your EVM wallet can receive it instead; it pays the gas on{' '}
              {transfer.chainName}.
            </span>
          )}
        </p>
      )}
      {status.kind === 'ready-receive' && (
        <p className="text-xs text-text-secondary mb-4">
          {status.circleFailed ? 'Circle could not mint it. ' : 'Circle has signed it. '}
          One signature in your EVM wallet receives the USDC on {transfer.chainName}; it pays the gas there. Any EVM
          wallet can submit it, the USDC goes to {shortenAddress(transfer.recipient, 6, 4)} either way.
        </p>
      )}

      {(status.kind === 'ready-receive' || circleSlow) && (
        <>
          <button
            onClick={handleReceive}
            disabled={receiving || !evm.address}
            className="w-full py-3 rounded-full bg-primary text-white font-semibold text-sm transition-all hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {receiving ? 'Receiving...' : `Receive on ${transfer.chainName}`}
          </button>
          {!evm.address && (
            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-coral">
              <span>Connect an EVM wallet to receive it.</span>
              <EvmConnectButtons small />
            </div>
          )}
        </>
      )}
      {status.kind === 'waiting-circle' && (
        <button
          disabled
          className="w-full py-3 rounded-full bg-primary text-white font-semibold text-sm opacity-40 cursor-not-allowed"
        >
          Waiting for Circle...
        </button>
      )}
      {error && <p className="text-[11px] text-coral mt-2 break-words">{error}</p>}
      <p className="text-[10px] text-text-muted mt-2">
        {network === 'testnet' ? 'Testnet. Test USDC, no real value.' : 'Mainnet. Real USDC.'}
      </p>
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
    <div className="flex justify-between gap-3">
      <span>{label}</span>
      <span className="text-text text-right">{value}</span>
    </div>
  )
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="mb-3 text-xs text-text-secondary">{children}</p>
}
