import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X, ArrowUpDown } from 'lucide-react'

import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { walletKitSigner } from '../integrations/signer/wallet-kit-signer'
import { getWalletNetworkPassphrase } from '../integrations/signer/wallet-network'
import { useSoroswapConfirm } from '../integrations/broker/hooks'
import { useSwapRoute } from '../integrations/routing/hooks'
import { swapTokensFor } from '../config/contracts'
import { networkPassphrase } from '../integrations/lobster/client'
import { cn, stellarExplorer } from '../utils/format'
import { appendRoutingEntry } from '../integrations/broker/routing-log'
import type { BrokerQuoteParams } from '../integrations/broker/types'
import { InfoTip } from './InfoTip'

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
    !networkMismatch

  async function handleConfirmFallback() {
    if (!canConfirmFallback || !soroswap || !params) return
    try {
      // a swap spends the connected wallet's own funds, so it always signs with
      // the wallet kit, never the dfns relay (which only signs treasury ops).
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
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-bg-card rounded-3xl p-6 w-full max-w-md card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text flex items-center gap-1.5">
            Best-execution swap
            <InfoTip label="best execution">
              Compares several exchanges and routes your swap through whichever gives you the most,
              automatically.
            </InfoTip>
          </h2>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-bg">
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

          <div className="flex gap-2">
            <label className="text-xs text-text-secondary w-16 self-center">Amount</label>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              className="flex-1 bg-bg rounded-lg px-3 py-2 text-sm font-mono"
            />
          </div>

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
              Max slippage 2% <InfoTip term="slippage" label="max slippage" />
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

          {source !== 'none' && broker && (
            <div className="bg-bg rounded-lg p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-text-muted">Via Stellar Broker</span>
                <span className="font-mono">
                  {broker.estimatedBuyingAmount} {buying.code}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Extra vs direct route</span>
                <span
                  className={cn(
                    'font-mono',
                    Number(broker.profit) > 0 ? 'text-green' : 'text-text',
                  )}
                >
                  {broker.profit}
                </span>
              </div>
              {source === 'soroswap-fallback' && (
                <p className="text-text-muted pt-1">
                  Price comparison from Stellar Broker. The swap itself runs on Soroswap for now.
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
            <p className="text-xs text-coral">{route.data.reason}</p>
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
            <p className="text-xs text-text-muted">
              Live best-execution quote from Stellar Broker, comparing Soroswap, Aquarius
              and Phoenix.
            </p>
          ) : source === 'soroswap-fallback' ? (
            <button
              onClick={handleConfirmFallback}
              disabled={!canConfirmFallback}
              className="w-full px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {confirmFallback.isPending ? 'Awaiting signature...' : 'Confirm Soroswap swap'}
            </button>
          ) : null}

          {confirmFallback.isError && (
            <p className="text-xs text-coral">
              {readableSwapError((confirmFallback.error as Error).message)}
            </p>
          )}
          {fallbackHash && (
            <div className="text-xs text-green">
              Swap confirmed.{' '}
              <a
                href={stellarExplorer(network, 'tx', fallbackHash)}
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
