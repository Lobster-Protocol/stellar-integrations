import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { X, Check } from 'lucide-react'
import { useAccount, useConnect, useDisconnect } from 'wagmi'
import { StellarWalletsKit } from '@creit-tech/stellar-wallets-kit'
import { cn, shortenAddress } from '../utils/format'
import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import {
  useBridgeQuote,
  useTrustline,
  useBridgeApprove,
  useBridgeSend,
} from '../integrations/allbridge/hooks'
import { CONTRACTS, EVM_USDC, EVM_EXPLORER_TX } from '../config/contracts'
import {
  BridgeRequestSchema,
  type BridgeRequest,
  type EvmSourceChain,
} from '../integrations/allbridge/types'
import { buildTrustlineXdr, submitTrustlineTx } from '../integrations/allbridge/trustline'
import { networkPassphrase } from '../integrations/lobster/client'
import { hasWalletConnectProjectId } from '../integrations/evm/config'

interface Props {
  open: boolean
  onClose: () => void
}

const CHAINS: Array<{
  id: 'stellar' | 'ETH' | 'ARB' | 'BSC'
  name: string
  icon: string
  bridge: boolean
}> = [
  { id: 'stellar', name: 'Stellar (direct)', icon: '✦', bridge: false },
  { id: 'ETH', name: 'Ethereum → Stellar', icon: 'Ξ', bridge: true },
  { id: 'ARB', name: 'Arbitrum → Stellar', icon: '◆', bridge: true },
  { id: 'BSC', name: 'BNB → Stellar', icon: '●', bridge: true },
]

const USDC_ASSET_CODE = 'USDC'

type Step =
  | { phase: 'form' }
  | { phase: 'approving' }
  | { phase: 'sending' }
  | { phase: 'submitted'; hash?: string; sourceChain?: EvmSourceChain }
  | { phase: 'failed'; msg: string }

export default function DepositModal({ open, onClose }: Props) {
  const [chain, setChain] = useState<(typeof CHAINS)[number]['id']>('stellar')
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
      setStep({ phase: 'failed', msg: 'Stellar direct deposits not available yet. Use the bridge from an EVM chain.' })
      return
    }

    if (!bridgeRequest || !evmChain || !evm.address) {
      setStep({ phase: 'failed', msg: 'Connect both wallets and enter an amount.' })
      return
    }

    if (network !== 'mainnet') {
      setStep({ phase: 'failed', msg: 'Allbridge only runs on mainnet. Switch the network first.' })
      return
    }

    // BNB usdc is 18-decimal, our allowance scaling assumes 6
    if (evmChain === 'BSC') {
      setStep({ phase: 'failed', msg: 'Use Ethereum or Arbitrum. BNB USDC is 18-decimal and not yet wired.' })
      return
    }

    // refetch right before send in case the cache is stale
    const fresh = await trustlineQuery.refetch()
    if (fresh.data !== true) {
      setStep({ phase: 'failed', msg: 'Destination has no USDC trustline (or the check did not resolve). Open the trustline on Stellar first, then retry.' })
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
      const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
        networkPassphrase: networkPassphrase(network),
        address: stellarAddr,
      })
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

  const quote = quoteQuery.data

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
            <div className="w-12 h-12 rounded-full bg-green/10 flex items-center justify-center mx-auto mb-4">
              <Check className="text-green" size={22} />
            </div>
            <h3 className="text-lg font-semibold text-text mb-2">
              {isBridge ? 'Bridge tx submitted' : 'Deposit initiated'}
            </h3>
            <p className="text-sm text-text-secondary mb-1">
              {isBridge
                ? `Bridging ${amount} USDC from ${selectedChain.name.split(' →')[0]}`
                : `Depositing ${amount} USDC`}
            </p>
            {step.hash && step.sourceChain && (
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
              Funds arrive on Stellar in ~2 min via Allbridge Core. Watch your balance.
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

            {/* source chain */}
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
                    <span>{c.icon}</span>
                    <span>{c.name.split(' →')[0]}</span>
                    {c.bridge && <span className="text-[10px] text-text-muted ml-auto">bridge</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* EVM wallet block */}
            {isBridge && (
              <div className="mb-4 px-3 py-2.5 rounded-xl bg-bg text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-text-secondary">EVM wallet</span>
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
                    Set VITE_WALLETCONNECT_PROJECT_ID for mobile wallets via WalletConnect.
                    Injected wallets (MetaMask, Rabby) work without it.
                  </p>
                )}
              </div>
            )}

            {/* amount */}
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

            {/* info */}
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
                  <span>Est. time</span>
                  <span className="text-text">
                    {quote ? `~${Math.round(quote.estimatedTimeSeconds / 60)} min` : '~2 min'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Trustline</span>
                  {trustlineQuery.isLoading ? (
                    <span className="text-text-muted">Checking...</span>
                  ) : trustlineRequired ? (
                    <button
                      onClick={handleCreateTrustline}
                      disabled={tl.phase === 'creating'}
                      className="text-coral font-medium underline disabled:opacity-50"
                    >
                      {tl.phase === 'creating' ? 'Creating...' : tl.phase === 'failed' ? 'Retry trustline' : 'Create trustline'}
                    </button>
                  ) : (
                    <span className="text-green font-medium">Active</span>
                  )}
                </div>
                {network === 'testnet' && (
                  <div className="mt-2 pt-2 border-t border-text-muted/10 text-coral">
                    Allbridge runs on mainnet only. Switch to mainnet to send a real bridge tx.
                  </div>
                )}
                {tl.phase === 'failed' && (
                  <div className="mt-2 pt-2 border-t border-text-muted/10 text-coral break-words">{tl.msg}</div>
                )}
              </div>
            )}

            {!isBridge && (
              <div className="mb-4 px-3 py-2.5 rounded-xl bg-primary/5 text-xs text-text-secondary space-y-1">
                <div className="flex justify-between">
                  <span>Tx fee</span>
                  <span className="text-text">~$0.00015</span>
                </div>
                <div className="flex justify-between">
                  <span>Strategy</span>
                  <span className="text-text font-medium">XLM/USDC Optimizer</span>
                </div>
              </div>
            )}

            <button
              onClick={handleDeposit}
              disabled={
                !amount ||
                Number(amount) <= 0 ||
                isWorking ||
                (isBridge && (!evm.address || network === 'testnet' || !trustlineOk))
              }
              className="w-full py-3 rounded-full bg-primary text-white font-semibold text-sm transition-all hover:bg-primary-dark disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {step.phase === 'approving'
                ? 'Approving USDC...'
                : step.phase === 'sending'
                ? 'Submitting bridge tx...'
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
