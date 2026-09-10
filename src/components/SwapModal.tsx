import { useEffect, useId, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, ArrowUpDown } from 'lucide-react'

import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useAccountBalances } from '../integrations/horizon/account'
import { walletKitSigner } from '../integrations/signer/wallet-kit-signer'
import { getWalletNetworkPassphrase } from '../integrations/signer/wallet-network'
import { useSoroswapConfirm, buildSoroswapConfirmTx, SOROSWAP_SLIPPAGE } from '../integrations/broker/hooks'
import { useSwapRoute } from '../integrations/routing/hooks'
import { swapTokensFor } from '../config/contracts'
import { networkPassphrase } from '../integrations/lobster/client'
import { submitSignedXdr, waitForTx } from '../integrations/lobster/factory'
import { useAccountSigning } from '../integrations/stellar/use-account-signing'
import { isMultisig, requiredWeight } from '../integrations/stellar/multisig'
import { cn, formatBalance, stellarExplorer } from '../utils/format'
import { appendRoutingEntry } from '../integrations/broker/routing-log'
import type { BrokerQuoteParams } from '../integrations/broker/types'
import { InfoTip } from './InfoTip'
import CoSignPanel from './CoSignPanel'

// a quorum swap widens both the tx timebound and the in-contract deadline so the
// frozen envelope survives while the signers sign, past the 180s single-sig value.
const MULTISIG_WINDOW_SECS = 3600

interface Props {
  open: boolean
  onClose: () => void
}

// a soroban sim error comes back as a wall of diagnostic events. pull out the
// cases a trader can actually act on and drop the raw trace.
function readableSwapError(message: string): string {
  // wallets refuse to sign when their own network toggle does not match the tx
  // network (Freighter: "set to Main Net ... not possible at the moment").
  if (/set to (main|test)\s?net|not possible at the moment|different network|network mismatch/i.test(message)) {
    return "Your wallet is on a different network than the app. Switch the wallet's network to match, then try again."
  }
  if (/resulting balance is not within the allowed range/i.test(message)) {
    return 'Not enough spendable XLM. An account keeps 1 XLM in reserve, so it cannot send its whole balance. Add funds or lower the amount.'
  }
  if (/Error\(Contract, ?#10\)/i.test(message)) {
    return 'Soroswap turned this route down, the pool could not fill it. Try a different amount.'
  }
  if (/trustline|op_no_trust|not authorized/i.test(message)) {
    return "This wallet hasn't turned on a trustline for this asset yet (a one-time approval needed to hold it)."
  }
  return message.split('\n')[0].slice(0, 160)
}

export default function SwapModal({ open, onClose }: Props) {
  const { address } = useWallet()
  const { network } = useNetwork()

  const [sellingCode, setSellingCode] = useState('XLM')
  const [buyingCode, setBuyingCode] = useState('USDC')
  const [amount, setAmount] = useState('')

  const tokens = useMemo(() => swapTokensFor(network), [network])
  // resolve the picked codes against the current network's token set. switching
  // network can drop a token (an XTAR pick on testnet, gone on mainnet), so fall
  // back rather than render an empty select.
  const selling = tokens.find((t) => t.code === sellingCode) ?? tokens[0]
  const buying =
    tokens.find((t) => t.code === buyingCode) ??
    tokens.find((t) => t.code !== selling.code) ??
    tokens[0]
  const sameToken = selling.code === buying.code

  // match the selling token to a wallet balance by code (useAccountBalances already
  // folds testnet's soroban-only USDC into a code:'USDC' line), for a Max button and
  // an over-balance guard. reserve rules still apply to a full-XLM max, and the
  // existing swap error covers that case.
  const balancesQ = useAccountBalances(network, address)
  const sellBalance = useMemo(
    () => balancesQ.data?.find((b) => b.code === selling.code)?.balance ?? null,
    [balancesQ.data, selling.code],
  )
  const overBalance = sellBalance != null && amount !== '' && Number(amount) > Number(sellBalance)

  const params: BrokerQuoteParams | null = useMemo(() => {
    if (!amount || sameToken) return null
    return {
      sellingAsset: selling.asset,
      buyingAsset: buying.asset,
      sellingAmount: amount,
      slippageTolerance: 0.02,
    }
  }, [selling.asset, buying.asset, sameToken, amount])

  const route = useSwapRoute(params, address, network)
  const confirmFallback = useSoroswapConfirm()
  const signingQ = useAccountSigning(network, address)
  const multi = signingQ.data ? isMultisig(signingQ.data) : false
  // multisig swap runs as build-once then gather a quorum, so it needs its own
  // local state rather than the one-shot mutation the single-sig path uses.
  const [coSign, setCoSign] = useState<{ baseXdr: string } | null>(null)
  const [multiHash, setMultiHash] = useState<string | null>(null)
  const [multiErr, setMultiErr] = useState<string | null>(null)
  const [multiBuilding, setMultiBuilding] = useState(false)

  // the wallet keeps its own network selection, separate from the app toggle.
  // if they differ the wallet refuses to sign, so read it and warn up front.
  const walletNetwork = useQuery({
    queryKey: ['wallet-network', address],
    queryFn: getWalletNetworkPassphrase,
    enabled: !!address,
    staleTime: 10_000,
  })
  const networkMismatch =
    !!address && !!walletNetwork.data && walletNetwork.data !== networkPassphrase(network)

  const titleId = useId()
  // building the envelope or awaiting the wallet signature is the one moment a
  // stray close would strand an in-progress sign, so gate every dismissal on it.
  const busy = confirmFallback.isPending || multiBuilding

  // the parent keeps this modal mounted when closed, so nothing resets on its own.
  // clear the amount, the mutation and any co-sign progress on close, or a reopen
  // shows a stale "Swap confirmed" and the last amount. fire only on the open
  // toggle: the mutation object identity is unstable, so listing it as a dep would
  // re-run this on every render.
  useEffect(() => {
    if (open) return
    setAmount('')
    setCoSign(null)
    setMultiHash(null)
    setMultiErr(null)
    setMultiBuilding(false)
    confirmFallback.reset()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, busy, onClose])

  if (!open) return null

  const source = route.data?.source
  const broker = route.data?.broker
  const soroswap = route.data?.soroswap

  const canConfirmFallback =
    !!address &&
    source === 'soroswap-fallback' &&
    !!soroswap &&
    !confirmFallback.isPending &&
    !!params &&
    !networkMismatch &&
    !overBalance &&
    // don't send a multisig account down the one-shot path while its signers are
    // still being read, and don't restart once a quorum collection is underway.
    !signingQ.isLoading &&
    !multiBuilding &&
    !coSign

  async function handleConfirmFallback() {
    if (!canConfirmFallback || !soroswap || !params) return
    // a swap spends the connected wallet's own funds, so it always signs with the
    // wallet kit, never the dfns relay (which only signs treasury ops).
    if (multi) {
      // build the envelope once with widened clocks, then hand it to the co-sign
      // panel. never rebuild after this, or the gathered signatures stop matching.
      setMultiErr(null)
      setMultiBuilding(true)
      try {
        const baseXdr = await buildSoroswapConfirmTx(
          {
            account: address!,
            network,
            networkPassphrase: networkPassphrase(network),
            params,
            buyingStroops: soroswap.buyingStroops,
            signer: walletKitSigner,
          },
          MULTISIG_WINDOW_SECS,
        )
        setCoSign({ baseXdr })
      } catch (e) {
        setMultiErr(readableSwapError(e instanceof Error ? e.message : 'Something went wrong'))
      } finally {
        setMultiBuilding(false)
      }
      return
    }
    try {
      const hash = await confirmFallback.mutateAsync({
        account: address!,
        network,
        networkPassphrase: networkPassphrase(network),
        params,
        buyingStroops: soroswap.buyingStroops,
        signer: walletKitSigner,
      })
      appendRoutingEntry({
        ts: Date.now(),
        path: 'soroswap-fallback',
        sellingAsset: params.sellingAsset,
        buyingAsset: params.buyingAsset,
        sellingAmount: params.sellingAmount ?? '',
        buyingAmount: soroswap.buyingAmount,
        txHash: hash,
        network,
      })
    } catch {
      // the mutation's error state drives the inline message below; swallow the
      // rejection here so the click handler doesn't raise an unhandled promise.
    }
  }

  const fallbackHash = confirmFallback.data ?? null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => { if (!busy) onClose() }}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="bg-bg-card rounded-3xl p-6 w-full max-w-md card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 id={titleId} className="text-lg font-semibold text-text flex items-center gap-1.5">
            Best-execution swap
            <InfoTip label="best execution">
              Compares several exchanges and routes your swap through whichever gives you the most,
              automatically.
            </InfoTip>
          </h2>
          <button onClick={onClose} disabled={busy} className="p-1 rounded-full hover:bg-bg disabled:opacity-40 disabled:cursor-not-allowed">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div className="flex gap-2">
            <label className="text-xs text-text-secondary w-16 self-center">Selling</label>
            <select
              value={selling.code}
              onChange={(e) => setSellingCode(e.target.value)}
              className="flex-1 bg-bg rounded-lg px-3 py-2 text-sm"
            >
              {tokens.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.code}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-center -my-1">
            <button
              type="button"
              onClick={() => {
                setSellingCode(buying.code)
                setBuyingCode(selling.code)
              }}
              aria-label="Switch selling and buying"
              title="Switch selling and buying"
              className="p-1.5 rounded-full bg-bg text-text-secondary hover:text-primary hover:bg-primary/10 transition-colors"
            >
              <ArrowUpDown size={14} />
            </button>
          </div>

          <div className="flex gap-2">
            <label className="text-xs text-text-secondary w-16 self-center">Buying</label>
            <select
              value={buying.code}
              onChange={(e) => setBuyingCode(e.target.value)}
              className="flex-1 bg-bg rounded-lg px-3 py-2 text-sm"
            >
              {tokens.map((t) => (
                <option key={t.code} value={t.code}>
                  {t.code}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 items-center">
            <label className="text-xs text-text-secondary w-16 self-center">Amount</label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              className="flex-1 bg-bg rounded-lg px-3 py-2 text-sm font-mono"
            />
            {sellBalance != null && (
              <button
                type="button"
                onClick={() => setAmount(sellBalance)}
                className="shrink-0 text-[11px] text-primary hover:underline"
              >
                Max
              </button>
            )}
          </div>
          {sellBalance != null && (
            <p className={cn('text-[11px]', overBalance ? 'text-coral' : 'text-text-muted')}>
              {overBalance
                ? `More than your ${selling.code} balance (${formatBalance(sellBalance)}).`
                : `Balance: ${formatBalance(sellBalance)} ${selling.code}`}
            </p>
          )}

          {sameToken && (
            <p className="text-xs text-coral">Selling and buying must differ.</p>
          )}

          {!amount && !sameToken && (
            <p className="text-xs text-text-muted">
              Enter an amount to compare the best route across Stellar Broker and Soroswap.
            </p>
          )}

          {amount && !sameToken && (
            <p className="text-[11px] text-text-muted flex items-center gap-1">
              Max slippage {SOROSWAP_SLIPPAGE * 100}% <InfoTip term="slippage" label="max slippage" />
            </p>
          )}

          {route.isLoading && (
            <div
              role="status"
              aria-label="Finding the best route"
              className="bg-bg rounded-lg p-3 space-y-2 animate-pulse"
            >
              <div className="h-3 w-2/3 rounded bg-text-muted/15" />
              <div className="h-3 w-1/2 rounded bg-text-muted/15" />
            </div>
          )}

          {/* The broker answers even when nothing here can be signed, and its answer
              next to the direct route is the whole point of routing through it. It
              used to be hidden whenever the executable leg fell through, which is
              exactly when the comparison is worth reading. */}
          {broker && (
            <div className="bg-bg rounded-lg p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-text-muted">Via Stellar Broker</span>
                <span className="font-mono">
                  {broker.estimatedBuyingAmount} {buying.code}
                </span>
              </div>
              {broker.directTrade && (
                <div className="flex justify-between">
                  <span className="text-text-muted">Direct route, same size</span>
                  <span className="font-mono">
                    {broker.directTrade.buying} {buying.code}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-text-muted">Extra vs direct route</span>
                <span
                  className={cn(
                    'font-mono',
                    Number(broker.profit) > 0 ? 'text-green' : 'text-text',
                  )}
                >
                  {broker.profit} {buying.code}
                </span>
              </div>
              {source === 'soroswap-fallback' && (
                <p className="text-text-muted pt-1">
                  Price comparison from Stellar Broker. The swap itself runs on Soroswap for now.
                </p>
              )}
              {source === 'none' && (
                <p className="text-text-muted pt-1">
                  Live price from Stellar Broker, for reference. Nothing on this pair can be
                  signed from here right now.
                </p>
              )}
            </div>
          )}

          {source === 'soroswap-fallback' && soroswap && (
            <div className="bg-bg rounded-lg p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-text-muted">Direct via Soroswap</span>
                <span className="font-mono">
                  {soroswap.buyingAmount} {buying.code}
                </span>
              </div>
            </div>
          )}

          {source === 'none' && !route.isLoading && route.data?.reason && (
            <p className={cn('text-xs', broker ? 'text-text-muted' : 'text-coral')}>
              {route.data.reason}
            </p>
          )}

          {networkMismatch && (
            <p className="text-xs text-coral">
              Your wallet is set to a different network. Switch it to {network} to match the
              app (or flip the app's network with the toggle at the top), then try again.
            </p>
          )}

          {!address ? (
            <p className="text-xs text-text-muted">Connect a Stellar wallet to confirm.</p>
          ) : source === 'broker' ? (
            <>
              {/* the broker leg is priced here but not signed here, so a
                  reviewer gets a disabled control and the reason instead of
                  a quote with nothing under it */}
              <button
                type="button"
                disabled
                className="w-full px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold opacity-40 cursor-not-allowed"
              >
                Cannot be signed from here
              </button>
              <p className="text-xs text-text-muted">
                Live best-execution quote from Stellar Broker, comparing Soroswap, Aquarius and
                Phoenix. The dashboard prices this route but does not sign it: signing a broker
                route is not switched on here. Pick a pair that routes through Soroswap to trade
                from this panel.
              </p>
            </>
          ) : source === 'soroswap-fallback' ? (
            <>
              {multi && signingQ.data && !coSign && (
                <div className="rounded-2xl bg-amber-500/10 text-amber-600 px-3 py-2.5 text-[11px]">
                  This account uses shared control. This swap needs {requiredWeight(signingQ.data, 'med')}{' '}
                  signatures. The quoted rate is locked in when you start. If the market moves more than 1%
                  before every signer approves, the swap is declined on-chain and you start over.
                </div>
              )}
              {!coSign && (
                <button
                  onClick={handleConfirmFallback}
                  disabled={!canConfirmFallback}
                  className="w-full px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {confirmFallback.isPending
                    ? 'Awaiting signature...'
                    : multiBuilding
                      ? 'Building...'
                      : 'Confirm Soroswap swap'}
                </button>
              )}
              {coSign && signingQ.data && !multiHash && (
                <CoSignPanel
                  network={network}
                  signing={signingQ.data}
                  baseXdr={coSign.baseXdr}
                  connected={address!}
                  submit={async (xdr) => {
                    const hash = await submitSignedXdr(network, xdr)
                    const final = await waitForTx(network, hash)
                    if (final.status !== 'SUCCESS') throw new Error(`the network reported ${final.status}`)
                    return hash
                  }}
                  onSubmitted={(hash) => {
                    setMultiHash(hash)
                    appendRoutingEntry({
                      ts: Date.now(),
                      path: 'soroswap-fallback',
                      sellingAsset: params!.sellingAsset,
                      buyingAsset: params!.buyingAsset,
                      sellingAmount: params!.sellingAmount ?? '',
                      buyingAmount: soroswap!.buyingAmount,
                      txHash: hash,
                      network,
                    })
                  }}
                />
              )}
              {multiErr && <p className="text-xs text-coral break-words">{multiErr}</p>}
            </>
          ) : null}

          {confirmFallback.isError && (
            <p className="text-xs text-coral">
              {readableSwapError((confirmFallback.error as Error).message)}
            </p>
          )}
          {(fallbackHash || multiHash) && (
            <div className="text-xs text-green">
              Swap confirmed.{' '}
              <a
                href={stellarExplorer(network, 'tx', (fallbackHash || multiHash)!)}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                View on Stellar Expert
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
