import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { X, Check } from 'lucide-react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { cn, shortenAddress } from '../utils/format'
import { InfoTip } from './InfoTip'
import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { walletKitSigner } from '../integrations/signer/wallet-kit-signer'
import {
  useBridgeQuote,
  useTrustline,
  useBridgeApprove,
  useBridgeSend,
} from '../integrations/allbridge/hooks'
import {
  CONTRACTS,
  EVM_USDC,
  EVM_EXPLORER_TX,
  EVM_BRIDGEABLE,
  EVM_CHAIN_NAME,
  type EvmChain,
} from '../config/contracts'
import {
  BridgeRequestSchema,
  type BridgeRequest,
  type EvmSourceChain,
} from '../integrations/allbridge/types'
import { buildTrustlineXdr, submitTrustlineTx } from '../integrations/allbridge/trustline'
import { networkPassphrase } from '../integrations/lobster/client'
import { hasWalletConnectProjectId } from '../integrations/evm/config'
import { simulateBridgeQuote } from '../integrations/allbridge/simulate'

interface Props {
  open: boolean
  onClose: () => void
  // Bridges opens the modal already pointed at a bridge chain, so it lands on
  // the bridge flow rather than the direct-Stellar placeholder.
  initialChain?: EvmChain | 'stellar'
}

// the bridgeable set comes from the registry, so this list and the Bridges page
// can never advertise different chains
const CHAINS: Array<{ id: 'stellar' | EvmChain; label: string; bridge: boolean }> = [
  { id: 'stellar', label: 'Stellar (direct)', bridge: false },
  ...(Object.keys(EVM_USDC) as EvmChain[])
    .filter((c) => EVM_BRIDGEABLE[c])
    .map((c) => ({ id: c, label: EVM_CHAIN_NAME[c], bridge: true })),
]

const USDC_ASSET_CODE = 'USDC'

type Step =
  | { phase: 'form' }
  | { phase: 'approving' }
  | { phase: 'sending' }
  | { phase: 'submitted'; hash?: string; sourceChain?: EvmSourceChain; simulated?: boolean }
  | { phase: 'failed'; msg: string }

export default function DepositModal({ open, onClose, initialChain }: Props) {
  const [chain, setChain] = useState<(typeof CHAINS)[number]['id']>(initialChain ?? 'stellar')
  const [amount, setAmount] = useState('')
  const [step, setStep] = useState<Step>({ phase: 'form' })
  const [tl, setTl] = useState<
    { phase: 'idle' } | { phase: 'creating' } | { phase: 'failed'; msg: string }
  >({ phase: 'idle' })
  const tlInFlight = useRef(false)

  const { address: stellarAddr } = useWallet()
  const { network } = useNetwork()

  const evm = useAccount()
  const { connectors, connect, isPending: isConnecting } = useConnect()
  const { disconnect } = useDisconnect()

  const selectedChain = CHAINS.find((c) => c.id === chain)!
  const isBridge = selectedChain.bridge
  const evmChain = isBridge ? (chain as EvmSourceChain) : null

  const bridgeRequest: BridgeRequest | null = useMemo(() => {
    if (!evmChain || !stellarAddr || !amount || !evm.address) return null
    try {
      return BridgeRequestSchema.parse({
        sourceChain: evmChain,
        amount,
        fromAddress: evm.address,
        toAddress: stellarAddr,
      })
    } catch {
      return null
    }
  }, [evmChain, amount, stellarAddr, evm.address])

  const usdcIssuer = CONTRACTS[network].tokens.usdcIssuer
  const trustlineQuery = useTrustline(
    usdcIssuer ? stellarAddr : null,
    USDC_ASSET_CODE,
    usdcIssuer,
    network,
  )
  const trustlineRequired = !!usdcIssuer && trustlineQuery.data === false
  // fail closed: only true when the check resolved to true. loading/error/undefined block the send.
  const trustlineOk = trustlineQuery.isSuccess && trustlineQuery.data === true
  const quoteQuery = useBridgeQuote(bridgeRequest, trustlineRequired)
  const approve = useBridgeApprove()
  const send = useBridgeSend()

  useEffect(() => {
    if (!open) {
      setStep({ phase: 'form' })
      setAmount('')
      setTl({ phase: 'idle' })
    }
  }, [open])

  useEffect(() => {
    // only reset the step on a network toggle. resetting on open too would
    // collide with the open-clear effect above.
    if (open) setStep({ phase: 'form' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network])

  const titleId = useId()
  const isWorking = step.phase === 'approving' || step.phase === 'sending'

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isWorking) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, isWorking, onClose])

  if (!open) return null

  const handleDeposit = async () => {
    if (!isBridge) {
      // direct stellar path not yet hooked to the factory
      setStep({ phase: 'failed', msg: 'Stellar direct deposits are not available yet. Use the bridge from another chain.' })
      return
    }

    // testnet has no real bridge (allbridge is mainnet-only, and there is no usdc
    // on stellar testnet). run a labelled walkthrough so the flow is visible end
    // to end; nothing moves and the result screen is badged as a simulation.
    if (network !== 'mainnet') {
      if (!evmChain || !amount || Number(amount) <= 0) {
        setStep({ phase: 'failed', msg: 'Pick a source chain and an amount to run the testnet walkthrough.' })
        return
      }
      setStep({ phase: 'approving' })
      await new Promise((r) => setTimeout(r, 700))
      setStep({ phase: 'sending' })
      await new Promise((r) => setTimeout(r, 900))
      setStep({ phase: 'submitted', sourceChain: evmChain, simulated: true })
      return
    }

    if (!bridgeRequest || !evmChain || !evm.address) {
      setStep({ phase: 'failed', msg: 'Connect both wallets and enter an amount.' })
      return
    }

    // a chain the registry marks unbridgeable can still be reached through a
    // stale selection, so refuse it at the send rather than only in the picker
    if (!EVM_BRIDGEABLE[evmChain]) {
      const usable = (Object.keys(EVM_USDC) as EvmChain[])
        .filter((c) => EVM_BRIDGEABLE[c])
        .map((c) => EVM_CHAIN_NAME[c])
        .join(' or ')
      setStep({
        phase: 'failed',
        msg: `${EVM_CHAIN_NAME[evmChain]} USDC uses a different decimal format that isn't supported here. Use ${usable}.`,
      })
      return
    }

    // refetch right before send in case the cache is stale
    const fresh = await trustlineQuery.refetch()
    if (fresh.data !== true) {
      setStep({ phase: 'failed', msg: "Your Stellar account doesn't have a USDC trustline yet (or the check didn't finish). Turn it on first, then retry." })
      return
    }

    const ok = window.confirm(
      `Bridge ${amount} USDC from ${evmChain} to ${shortenAddress(stellarAddr ?? '', 6, 4)} on MAINNET.\n\nThis moves real funds. Continue?`,
    )
    if (!ok) {
      setStep({ phase: 'form' })
      return
    }

    try {
      setStep({ phase: 'approving' })
      await approve.mutateAsync({
        owner: evm.address,
        chain: evmChain,
        tokenAddress: EVM_USDC[evmChain],
        amount,
      })

      setStep({ phase: 'sending' })
      const result = await send.mutateAsync(bridgeRequest)
      setStep({ phase: 'submitted', hash: result.hash, sourceChain: evmChain })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Bridge submission failed'
      setStep({ phase: 'failed', msg })
    }
  }

  const handleCreateTrustline = async () => {
    if (!stellarAddr || !usdcIssuer || tlInFlight.current) return
    tlInFlight.current = true
    try {
      setTl({ phase: 'creating' })
      const xdr = await buildTrustlineXdr(stellarAddr, USDC_ASSET_CODE, usdcIssuer, network)
      // the trustline lives on the connected wallet's own account, so it signs
      // with the wallet kit. the DFNS relay only signs treasury-sourced ops.
      const { signedTxXdr } = await walletKitSigner.signTransaction(xdr, {
        networkPassphrase: networkPassphrase(network),
        address: stellarAddr,
      })
      if (!signedTxXdr) throw new Error('wallet did not return a signed trustline transaction')
      await submitTrustlineTx(signedTxXdr, network)
      await trustlineQuery.refetch()
      setTl({ phase: 'idle' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Trustline creation failed'
      setTl({ phase: 'failed', msg })
    } finally {
      tlInFlight.current = false
    }
  }

  const quote =
    network !== 'mainnet' && isBridge && amount && Number(amount) > 0
      ? simulateBridgeQuote(amount)
      : quoteQuery.data

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={() => { if (!isWorking) onClose() }}
    >
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative bg-bg-card rounded-3xl p-6 w-full max-w-md mx-4"
        style={{
          border: '1px solid rgba(13, 45, 76, 0.1)',
          boxShadow: '0 25px 60px rgba(8, 10, 12, 0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {step.phase === 'submitted' ? (
          <div className="text-center py-6">
            {step.simulated && (
              <div className="mb-4 inline-block rounded-full bg-amber-500/10 text-amber-500 text-[11px] font-semibold px-3 py-1">
                Simulation - no funds moved
              </div>
            )}
            <div className="w-12 h-12 rounded-full bg-green/10 flex items-center justify-center mx-auto mb-4">
              <Check className="text-green" size={22} />
            </div>
            <h3 className="text-lg font-semibold text-text mb-2">
              {step.simulated ? 'Bridge simulated' : isBridge ? 'Bridge started' : 'Deposit started'}
            </h3>
            <p className="text-sm text-text-secondary mb-1">
              {isBridge
                ? `Bridging ${amount} USDC from ${selectedChain.label}`
                : `Depositing ${amount} USDC`}
            </p>
            {!step.simulated && step.hash && step.sourceChain && (
              <a
                href={EVM_EXPLORER_TX[step.sourceChain](step.hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline font-mono break-all inline-block mt-2"
              >
                {shortenAddress(step.hash, 6, 4)}
              </a>
            )}
            <p className="text-xs text-text-muted mt-3">
              {step.simulated
                ? 'This is a labelled walkthrough on testnet. Allbridge has no testnet and there is no USDC on Stellar testnet, so no real transfer runs here. Switch to mainnet to bridge real USDC.'
                : 'Funds arrive on Stellar once the transaction on the source chain confirms, through Allbridge Core. Keep an eye on your balance.'}
            </p>
            <button
              onClick={onClose}
              className="mt-6 px-6 py-2 rounded-full bg-primary text-white text-sm font-medium"
            >
              Done
            </button>
          </div>
        ) : step.phase === 'failed' ? (
          <div className="text-center py-6">
            <h3 className="text-lg font-semibold text-text mb-2">Could not complete deposit</h3>
            <p className="text-sm text-text-secondary mb-4">{step.msg}</p>
            <button
              onClick={() => setStep({ phase: 'form' })}
              className="px-6 py-2 rounded-full bg-primary text-white text-sm font-medium"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-5">
              <h3 id={titleId} className="text-lg font-semibold text-text">Deposit Funds</h3>
              <button
                onClick={onClose}
                aria-label="Close deposit modal"
                className="text-text-muted hover:text-text text-lg"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mb-4">
              <label className="text-xs text-text-secondary font-medium mb-2 block">Source</label>
              <div className="grid grid-cols-2 gap-2">
                {CHAINS.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setChain(c.id)}
                    className={cn(
                      'px-3 py-2.5 rounded-xl text-xs font-medium text-left transition-all flex items-center gap-2',
                      chain === c.id
                        ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                        : 'bg-bg text-text-secondary hover:bg-bg/80',
                    )}
                  >
                    <span>{c.label}</span>
                    {c.bridge && <span className="text-[10px] text-text-muted ml-auto">bridge</span>}
                  </button>
                ))}
              </div>
            </div>

            {isBridge && (
              <div className="mb-4 px-3 py-2.5 rounded-xl bg-bg text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">Sending wallet</span>
                  {evm.address ? (
                    <span className="flex items-center gap-2 text-text font-mono">
                      {shortenAddress(evm.address, 6, 4)}
                      <button
                        onClick={() => disconnect()}
                        className="text-[10px] text-text-muted hover:text-coral"
                      >
                        disconnect
                      </button>
                    </span>
                  ) : (
                    <div className="flex gap-1 flex-wrap">
                      {connectors.map((c) => (
                        <button
                          key={c.uid}
                          onClick={() => connect({ connector: c })}
                          disabled={isConnecting}
                          className="px-2 py-1 rounded-md bg-primary text-white text-[11px] font-medium disabled:opacity-50"
                        >
                          {c.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {!hasWalletConnectProjectId && !evm.address && (
                  <p className="text-[10px] text-text-muted">
                    Mobile wallets (via WalletConnect) need extra setup. Browser wallets like
                    MetaMask or Rabby work right away.
                  </p>
                )}
              </div>
            )}

            <div className="mb-4">
              <label className="text-xs text-text-secondary font-medium mb-2 block">Amount (USDC)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                className="w-full px-4 py-3 rounded-xl bg-bg text-text text-sm outline-none focus:ring-1 focus:ring-primary/30"
                style={{ border: '1px solid rgba(13, 45, 76, 0.08)' }}
              />
            </div>

            {isBridge && (
              <div className="mb-4 px-3 py-2.5 rounded-xl bg-primary/5 text-xs text-text-secondary space-y-1">
                <div className="flex justify-between">
                  <span>Bridge provider</span>
                  <span className="text-text font-medium">Allbridge Core</span>
                </div>
                <div className="flex justify-between">
                  <span>You receive</span>
                  <span className="text-text">
                    {quote ? `${quote.amountOutFloat} USDC` : amount ? '...' : '-'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Estimated arrival</span>
                  <span className="text-text">
                    {quote
                      ? quote.estimatedTimeSeconds != null
                        ? `~${Math.round(quote.estimatedTimeSeconds / 60)} min`
                        : 'varies'
                      : amount
                        ? '...'
                        : '-'}
                  </span>
                </div>
                {network === 'mainnet' && (
                  <div className="flex justify-between">
                    <span className="flex items-center gap-1">
                      Trustline <InfoTip term="trustline" label="a trustline" />
                    </span>
                    {trustlineQuery.isLoading ? (
                      <span className="text-text-muted">Checking...</span>
                    ) : trustlineOk ? (
                      <span className="text-green font-medium">Active</span>
                    ) : (
                      <button
                        onClick={handleCreateTrustline}
                        disabled={tl.phase === 'creating'}
                        className="text-coral font-medium underline disabled:opacity-50"
                      >
                        {tl.phase === 'creating' ? 'Creating...' : tl.phase === 'failed' ? 'Retry trustline' : 'Create trustline'}
                      </button>
                    )}
                  </div>
                )}
                {network === 'testnet' && (
                  <div className="mt-2 pt-2 border-t border-text-muted/10 text-amber-500">
                    Simulation only: Allbridge has no testnet, so this walks the flow without moving funds. Switch to mainnet for a real transfer.
                  </div>
                )}
                {tl.phase === 'failed' && (
                  <div className="mt-2 pt-2 border-t border-text-muted/10 text-coral break-words">{tl.msg}</div>
                )}
              </div>
            )}

            {!isBridge && (
              <div className="mb-4 px-3 py-2.5 rounded-xl bg-primary/5 text-xs text-text-secondary">
                Direct Stellar deposits aren't available yet. For now, bridge USDC from another
                chain.
              </div>
            )}

            <button
              onClick={handleDeposit}
              disabled={
                !amount ||
                Number(amount) <= 0 ||
                isWorking ||
                !stellarAddr ||
                (isBridge && network === 'mainnet' && (!evm.address || !trustlineOk))
              }
              className="w-full py-3 rounded-full bg-primary text-white font-semibold text-sm transition-all hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {step.phase === 'approving'
                ? 'Approving USDC...'
                : step.phase === 'sending'
                ? 'Sending the bridge...'
                : isBridge
                ? 'Bridge & Deposit'
                : 'Deposit'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
