import { useMemo, useState } from 'react'
import { X, ArrowUpDown } from 'lucide-react'

import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { walletKitSigner } from '../integrations/signer/wallet-kit-signer'
import { useSoroswapConfirm } from '../integrations/broker/hooks'
import { useSwapRoute } from '../integrations/routing/hooks'
import { swapTokensFor } from '../config/contracts'
import { networkPassphrase } from '../integrations/lobster/client'
import { cn, stellarExplorer } from '../utils/format'
import { appendRoutingEntry } from '../integrations/broker/routing-log'
import type { BrokerQuoteParams } from '../integrations/broker/types'

interface Props {
  open: boolean
  onClose: () => void
}

// a soroban sim error comes back as a wall of diagnostic events. pull out the
// cases a trader can actually act on and drop the raw trace.
function readableSwapError(message: string): string {
  if (/resulting balance is not within the allowed range/i.test(message)) {
    return 'Not enough spendable XLM. An account keeps 1 XLM in reserve, so it cannot send its whole balance. Add funds or lower the amount.'
  }
  if (/Error\(Contract, ?#10\)/i.test(message)) {
    return 'Soroswap turned this route down, the pool could not fill it. Try a different amount.'
  }
  if (/trustline|op_no_trust|not authorized/i.test(message)) {
    return 'The wallet has no trustline for this asset yet.'
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
  // network can drop a token (an EURC pick on testnet, then mainnet which only
  // lists XLM/USDC), so fall back rather than render an empty select.
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

  if (!open) return null

  const source = route.data?.source
  const broker = route.data?.broker
  const soroswap = route.data?.soroswap

  const canConfirmFallback =
    !!address && source === 'soroswap-fallback' && !!soroswap && !confirmFallback.isPending && !!params

  async function handleConfirmFallback() {
    if (!canConfirmFallback || !soroswap || !params) return
    try {
      // the swap spends the connected wallet's own funds and is a Soroban
      // invokeHostFunction, which the DFNS relay guard refuses (it only signs
      // treasury-sourced payment ops). so it always signs with the wallet kit,
      // regardless of the custody-mode toggle.
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
          <h2 className="text-lg font-semibold text-text">Best-execution swap</h2>
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
                <span className="text-text-muted">Broker estimated receive</span>
                <span className="font-mono">
                  {broker.estimatedBuyingAmount} {buying.code}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Profit vs direct</span>
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
                  Reference quote from Stellar Broker. The trade settles on Soroswap until
                  the partner key is live.
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

          {!address ? (
            <p className="text-xs text-text-muted">Connect a Stellar wallet to confirm.</p>
          ) : source === 'broker' ? (
            <p className="text-xs text-text-muted">
              Live best-execution quote from Stellar Broker, aggregating Soroswap, Aquarius
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
                view on stellar expert
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
