import { useMemo, useState } from 'react'
import { X } from 'lucide-react'

import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { useSigner } from '../contexts/CustodyContext'
import { useBrokerConfirm, useSoroswapConfirm } from '../integrations/broker/hooks'
import { useSwapRoute } from '../integrations/routing/hooks'
import { CONTRACTS } from '../config/contracts'
import { networkPassphrase } from '../integrations/lobster/client'
import { stellarExplorer } from '../utils/format'
import { appendRoutingEntry } from '../integrations/broker/routing-log'
import type { BrokerQuoteParams } from '../integrations/broker/types'
import { cn } from '../utils/format'

interface Props {
  open: boolean
  onClose: () => void
}

type Asset = 'XLM' | 'USDC'

function assetKey(asset: Asset, network: 'mainnet' | 'testnet'): string | null {
  if (asset === 'XLM') return 'xlm'
  const issuer = CONTRACTS[network].tokens.usdcIssuer
  return issuer ? `USDC-${issuer}` : null
}

export default function SwapModal({ open, onClose }: Props) {
  const { address } = useWallet()
  const { network } = useNetwork()
  const signer = useSigner()

  const [selling, setSelling] = useState<Asset>('XLM')
  const [buying, setBuying] = useState<Asset>('USDC')
  const [amount, setAmount] = useState('')

  const params: BrokerQuoteParams | null = useMemo(() => {
    if (!amount || selling === buying) return null
    const s = assetKey(selling, network)
    const b = assetKey(buying, network)
    if (!s || !b) return null
    return { sellingAsset: s, buyingAsset: b, sellingAmount: amount, slippageTolerance: 0.02 }
  }, [selling, buying, amount, network])

  const route = useSwapRoute(params, address, network)
  const confirmBroker = useBrokerConfirm()
  const confirmFallback = useSoroswapConfirm()

  if (!open) return null

  const source = route.data?.source
  const broker = route.data?.broker
  const soroswap = route.data?.soroswap

  const canConfirmBroker =
    !!address && source === 'broker' && !!broker && !confirmBroker.isPending

  const canConfirmFallback =
    !!address && source === 'soroswap-fallback' && !!soroswap && !confirmFallback.isPending && !!params

  async function handleConfirmBroker() {
    if (!canConfirmBroker || !params || !broker) return
    let lastHash: string | undefined
    await confirmBroker.mutateAsync({
      account: address!,
      networkPassphrase: networkPassphrase(network),
      signer,
      onHash: (h) => {
        lastHash = h
      },
    })
    appendRoutingEntry({
      ts: Date.now(),
      path: 'broker',
      sellingAsset: params.sellingAsset,
      buyingAsset: params.buyingAsset,
      sellingAmount: params.sellingAmount ?? '',
      buyingAmount: broker.estimatedBuyingAmount,
      txHash: lastHash,
      network,
    })
  }

  async function handleConfirmFallback() {
    if (!canConfirmFallback || !soroswap || !params) return
    const hash = await confirmFallback.mutateAsync({
      account: address!,
      network,
      networkPassphrase: networkPassphrase(network),
      params,
      buyingStroops: soroswap.buyingStroops,
      signer,
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
              value={selling}
              onChange={(e) => setSelling(e.target.value as Asset)}
              className="flex-1 bg-bg rounded-lg px-3 py-2 text-sm"
            >
              <option value="XLM">XLM</option>
              <option value="USDC">USDC</option>
            </select>
          </div>

          <div className="flex gap-2">
            <label className="text-xs text-text-secondary w-16 self-center">Buying</label>
            <select
              value={buying}
              onChange={(e) => setBuying(e.target.value as Asset)}
              className="flex-1 bg-bg rounded-lg px-3 py-2 text-sm"
            >
              <option value="XLM">XLM</option>
              <option value="USDC">USDC</option>
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

          {selling === buying && (
            <p className="text-xs text-coral">Selling and buying must differ.</p>
          )}

          {route.isLoading && <p className="text-xs text-text-muted">Routing your swap...</p>}

          {source === 'broker' && broker && (
            <div className="bg-bg rounded-lg p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-text-muted">Broker estimated receive</span>
                <span className="font-mono">
                  {broker.estimatedBuyingAmount} {buying}
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
            </div>
          )}

          {source === 'soroswap-fallback' && soroswap && (
            <div className="bg-bg rounded-lg p-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-text-muted">Direct via Soroswap</span>
                <span className="font-mono">
                  {soroswap.buyingAmount} {buying}
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
            <button
              onClick={handleConfirmBroker}
              disabled={!canConfirmBroker}
              className="w-full px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {confirmBroker.isPending ? 'Awaiting signature...' : 'Confirm broker swap'}
            </button>
          ) : source === 'soroswap-fallback' ? (
            <button
              onClick={handleConfirmFallback}
              disabled={!canConfirmFallback}
              className="w-full px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {confirmFallback.isPending ? 'Awaiting signature...' : 'Confirm Soroswap swap'}
            </button>
          ) : null}

          {confirmBroker.isError && (
            <p className="text-xs text-coral">{(confirmBroker.error as Error).message}</p>
          )}
          {confirmFallback.isError && (
            <p className="text-xs text-coral">{(confirmFallback.error as Error).message}</p>
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
