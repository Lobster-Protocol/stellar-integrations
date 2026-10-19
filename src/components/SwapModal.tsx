import { useEffect, useId, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, ArrowUpDown } from 'lucide-react'

import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useAccountBalances } from '../integrations/horizon/account'
import { getSorobanTokenBalance } from '../integrations/stellar/token-balance'
import { stroopsToDecimal } from '../integrations/stellar/amount'
import { isContractId } from '../integrations/stellar/strkey-guards'
import { walletKitSigner } from '../integrations/signer/wallet-kit-signer'
import { getWalletNetworkPassphrase } from '../integrations/signer/wallet-network'
import { useSoroswapConfirm, buildSoroswapConfirmTx, SOROSWAP_DEADLINE_SEC, SOROSWAP_SLIPPAGE } from '../integrations/broker/hooks'
import { windowSecs } from '../integrations/signer/validity'
import { walletAnswerText } from '../integrations/signer/wallet-errors'
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

// timebound and swap deadline both get an hour so a quorum can finish signing
const MULTISIG_WINDOW_SECS = 3600

interface Props {
  open: boolean
  onClose: () => void
}

function readableSwapError(message: string): string {
  const unanswered = walletAnswerText(message)
  if (unanswered) return unanswered
  // wallets refuse to sign when their own network toggle differs from the tx
  if (/set to (main|test)\s?net|not possible at the moment|different network|network mismatch/i.test(message)) {
    return "Your wallet is on a different network than the app. Switch the wallet's network to match, then try again."
  }
  if (/resulting balance is not within the allowed range/i.test(message)) {
    return "Not enough spendable XLM. An account has to keep a minimum XLM reserve, more with each trustline, so it can't send its whole balance. Add funds or lower the amount."
  }
  if (/Error\(Contract, ?#10\)/i.test(message)) {
    return "This wallet doesn't hold enough of the token you're selling. Lower the amount."
  }
  if (/trustline|op_no_trust|not authorized/i.test(message)) {
    return "This wallet hasn't turned on a trustline for this asset yet (a one-time approval needed to hold it)."
  }
  return message.split('\n')[0].slice(0, 160)
}

export default function SwapModal({ open, onClose }: Props) {
  const { address, walletId } = useWallet()
  const { network } = useNetwork()

  const [sellingCode, setSellingCode] = useState('XLM')
  const [buyingCode, setBuyingCode] = useState('USDC')
  const [amount, setAmount] = useState('')

  const tokens = useMemo(() => swapTokensFor(network), [network])
  // the picked token may not exist after a network switch
  const selling = tokens.find((t) => t.code === sellingCode) ?? tokens[0]
  const buying =
    tokens.find((t) => t.code === buyingCode) ??
    tokens.find((t) => t.code !== selling.code) ??
    tokens[0]
  const sameToken = selling.code === buying.code

  // testnet's soroban-only USDC already comes back here as a 'USDC' line.
  // Max on XLM still hits the reserve; readableSwapError explains that one.
  const balancesQ = useAccountBalances(network, address)
  const classicSell = useMemo(() => {
    const lines = balancesQ.data
    if (!lines) return null
    // match code AND issuer, or a same-code asset from another issuer could stand in
    const dash = selling.asset.indexOf('-')
    if (dash > 0) {
      const issuer = selling.asset.slice(dash + 1)
      return lines.find((b) => b.code === selling.code && b.issuer === issuer)?.balance ?? null
    }
    if (selling.asset.startsWith('C')) {
      return lines.find((b) => b.code === selling.code && b.issuer === selling.asset)?.balance ?? null
    }
    return lines.find((b) => b.code === selling.code && !b.issuer)?.balance ?? null
  }, [balancesQ.data, selling.code, selling.asset])
  // Horizon doesn't list bare SAC ids, so ask the contract's balance() instead
  const sellSac = isContractId(selling.asset) ? selling.asset : null
  const sacSell = useQuery({
    queryKey: ['swap-sac-balance', network, address, sellSac],
    queryFn: async () => {
      const raw = await getSorobanTokenBalance(network, sellSac!, address!)
      return raw === null ? null : stroopsToDecimal(raw)
    },
    enabled: !!address && !!sellSac && classicSell == null,
    staleTime: 20_000,
    retry: 1,
  })
  const sellBalance = classicSell ?? sacSell.data ?? null
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
  const [coSign, setCoSign] = useState<{ baseXdr: string } | null>(null)
  const [multiHash, setMultiHash] = useState<string | null>(null)
  const [multiErr, setMultiErr] = useState<string | null>(null)
  const [multiBuilding, setMultiBuilding] = useState(false)

  // warn before the wallet refuses to sign
  const walletNetwork = useQuery({
    queryKey: ['wallet-network', address],
    queryFn: getWalletNetworkPassphrase,
    enabled: !!address,
    staleTime: 10_000,
  })
  const networkMismatch =
    !!address && !!walletNetwork.data && walletNetwork.data !== networkPassphrase(network)

  const titleId = useId()
  // closing mid-sign would strand the wallet prompt
  const busy = confirmFallback.isPending || multiBuilding

  // still mounted when closed; a reopen would otherwise show the old "Swap confirmed".
  // only open is a dep because the mutation object changes every render.
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
    // wait for the signer list before picking a path, and never restart a quorum round
    !signingQ.isLoading &&
    !multiBuilding &&
    !coSign

  async function handleConfirmFallback() {
    if (!canConfirmFallback || !soroswap || !params) return
    // a swap spends the wallet's own funds and signs with the wallet kit, never the dfns relay
    if (multi) {
      // build it once; a rebuilt envelope wouldn't match the signatures already gathered
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
        windowSecs: windowSecs({ quorum: false, walletId, base: SOROSWAP_DEADLINE_SEC }),
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
      // the isError branch below shows it
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
              On mainnet it shows the Stellar Broker price next to the direct Soroswap one. The swap
              itself runs on Soroswap.
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
              Enter an amount to see the Soroswap quote, with the Stellar Broker price next to it on
              mainnet.
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

          {/* shown even when nothing can be signed; the comparison is the point */}
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
          ) : source === 'soroswap-fallback' ? (
            <>
              {multi && signingQ.data && !coSign && (
                <div className="rounded-2xl bg-amber-500/10 text-amber-600 px-3 py-2.5 text-[11px]">
                  This account uses shared control. This swap needs a signing weight
                  of {requiredWeight(signingQ.data, 'med')}. The minimum you receive is fixed when
                  you start. If the rate moves more than {SOROSWAP_SLIPPAGE * 100}% against you
                  before the last signature, the swap is declined on-chain and you start over.
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
                    if (final.status !== 'SUCCESS') throw new Error(`The network reported ${final.status}.`)
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
