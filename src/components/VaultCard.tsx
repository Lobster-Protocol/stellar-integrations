import { useState } from 'react'
import { Link } from 'react-router-dom'
import { EyeOff } from 'lucide-react'

import { VENUE_LABEL, type VaultPosition } from '../integrations/lobster/position'
import { useVaultDetail } from '../integrations/lobster/vault-detail'
import type { VaultAction } from '../integrations/lobster/vault-tx'
import type { Network } from '../config/contracts'
import { formatBalance, formatValue, shortenAddress, stellarExplorer } from '../utils/format'
import type { PriceUnit } from '../integrations/pricing/price'
import CopyButton from './CopyButton'
import TokenRef from './TokenRef'
import { Card, Disclosure } from './ui'
import { InfoTip } from './InfoTip'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-text-muted shrink-0">{label}</span>
      <span className="text-right min-w-0">{children}</span>
    </div>
  )
}

function Ref({ id, network }: { id: string; network: Network }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <a
        href={stellarExplorer(network, id.startsWith('C') ? 'contract' : 'account', id)}
        target="_blank"
        rel="noopener noreferrer"
        title={id}
        className="font-mono text-primary hover:underline"
      >
        {shortenAddress(id, 6, 4)}
      </a>
      <CopyButton value={id} what="the address" />
    </span>
  )
}

export default function VaultCard({
  vault: v,
  value,
  partial,
  unit,
  network,
  account,
  priceOf,
  share,
  onAction,
  onHide,
}: {
  vault: VaultPosition
  value: number
  partial: boolean
  unit: PriceUnit
  network: Network
  account: string
  priceOf: (tokenId: string) => number | null
  share: number
  onAction: (action: VaultAction) => void
  onHide: () => void
}) {
  const [open, setOpen] = useState(false)
  const detail = useVaultDetail(network, account, v, open)

  // a working vault holds its tokens in the pool, not in itself, so the headline
  // per token is the two added together
  const total = (idle: string, pooled: string | null) => Number(idle) + Number(pooled ?? 0)
  const held0 = total(v.amount0, v.pooled0)
  const held1 = total(v.amount1, v.pooled1)
  const working = v.pooled0 !== null || v.pooled1 !== null

  const legValue = (id: string, amount: number): number | null => {
    const price = priceOf(id)
    return price == null ? null : amount * price
  }
  const value0 = legValue(v.token0, held0)
  const value1 = legValue(v.token1, held1)
  // withdraw_contract only moves what sits in the vault, so the button follows
  // the idle balance rather than the total
  const empty = Number(v.amount0) === 0 && Number(v.amount1) === 0

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <span className="flex items-center gap-0.5">
            <a
              href={stellarExplorer(network, 'contract', v.address)}
              target="_blank"
              rel="noopener noreferrer"
              title={v.address}
              className="font-mono text-sm text-primary hover:underline"
            >
              {shortenAddress(v.address, 6)}
            </a>
            <CopyButton value={v.address} what="the vault address" />
          </span>
          <div className="text-xs text-text-secondary mt-0.5 flex items-center gap-1">
            <TokenRef id={v.token0} /> / <TokenRef id={v.token1} />
          </div>
        </div>
        <span
          className={
            v.venue === 'idle'
              ? 'text-xs px-2.5 py-1 rounded-full bg-bg text-text-muted shrink-0'
              : 'text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary shrink-0'
          }
        >
          {VENUE_LABEL[v.venue]}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl bg-bg px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">
            <TokenRef id={v.token0} />
          </div>
          <div className="text-sm text-text tabular-nums">{formatBalance(String(held0))}</div>
          <div className="text-[10px] text-text-muted tabular-nums">
            {value0 == null ? 'no price' : formatValue(value0, unit)}
          </div>
        </div>
        <div className="rounded-xl bg-bg px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">
            <TokenRef id={v.token1} />
          </div>
          <div className="text-sm text-text tabular-nums">{formatBalance(String(held1))}</div>
          <div className="text-[10px] text-text-muted tabular-nums">
            {value1 == null ? 'no price' : formatValue(value1, unit)}
          </div>
        </div>
        <div className="rounded-xl bg-bg px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-0.5">Value</div>
          <div className="text-sm text-text tabular-nums">
            {formatValue(value, unit)}
            {partial && <span className="text-text-muted"> +</span>}
          </div>
          <div className="text-[10px] text-text-muted tabular-nums">
            {share > 0 ? `${share.toFixed(1)}% of portfolio` : 'nothing to weigh'}
          </div>
        </div>
      </div>

      {working && (
        <p className="mt-3 text-xs text-text-secondary">
          Most of that is in the pool, not in the vault itself. The split is in the details below.
        </p>
      )}

      {v.venue !== 'idle' && v.poolAddress && (
        <div className="mt-3 text-xs text-text-secondary">
          Working in <Ref id={v.poolAddress} network={network} />
          {v.lpShares && (
            <span className="text-text-muted">
              {' '}
              - {formatBalance(v.lpShares)} pool shares{' '}
              <InfoTip term="lpShares" label="pool shares" />
            </span>
          )}
        </div>
      )}

      {!v.complete && (
        <p className="text-xs text-coral mt-3">
          This vault reports a deployed position but would not return its pool.
        </p>
      )}

      <div className="mt-3">
        <Disclosure summary="What this vault holds and where" onOpenChange={setOpen}>
          <div className="text-xs">
            <Row label="Vault contract">
              <Ref id={v.address} network={network} />
            </Row>
            <Row label="Owner">
              <Ref id={v.owner} network={network} />
            </Row>
            <Row label="Working on">
              <span className="text-text">{VENUE_LABEL[v.venue]}</span>
            </Row>
            <Row label="Idle in the vault">
              <span className="text-text tabular-nums">
                {formatBalance(v.amount0)} / {formatBalance(v.amount1)}
              </span>
            </Row>
            {v.venue !== 'idle' && (
              <Row label="In the pool">
                {v.pooled0 !== null && v.pooled1 !== null ? (
                  <span className="text-text tabular-nums">
                    {formatBalance(v.pooled0)} / {formatBalance(v.pooled1)}
                  </span>
                ) : (
                  <span className="text-text-muted">the pool would not say</span>
                )}
              </Row>
            )}
            {v.venue !== 'idle' && (
              <>
                <Row label="Pool">
                  {v.poolAddress ? (
                    <Ref id={v.poolAddress} network={network} />
                  ) : (
                    <span className="text-text-muted">not reported</span>
                  )}
                </Row>
                <Row label="Router">
                  {detail.isLoading ? (
                    <span className="text-text-muted">reading...</span>
                  ) : detail.data?.router ? (
                    <Ref id={detail.data.router} network={network} />
                  ) : (
                    <span className="text-text-muted">not reported</span>
                  )}
                </Row>
                <Row label="Pool share token">
                  {detail.isLoading ? (
                    <span className="text-text-muted">reading...</span>
                  ) : detail.data?.shareToken ? (
                    <Ref id={detail.data.shareToken} network={network} />
                  ) : (
                    <span className="text-text-muted">not reported</span>
                  )}
                </Row>
              </>
            )}
            <Row label="Approver">
              {detail.isLoading ? (
                <span className="text-text-muted">reading...</span>
              ) : detail.data?.multisig ? (
                <Ref id={detail.data.multisig} network={network} />
              ) : (
                <span className="text-text-muted">not reported</span>
              )}
            </Row>

            <p className="text-text-muted pt-2">
              No return figure here on purpose. This vault records what it holds, not what it cost,
              so any yield number would be a guess. The trail below is what actually moved.
            </p>

            <p className="text-text-muted pt-2">
              A vault cannot be deleted. The Factory has no call to unregister one and the vault has
              no call to close itself, so withdrawing everything and hiding the card is as far as it
              goes. Hiding is local to this browser.
            </p>

            <div className="pt-2 flex flex-wrap gap-3">
              <Link
                to={`/activity?q=${v.address}`}
                className="text-primary hover:underline"
              >
                Every operation on this vault
              </Link>
              <a
                href={stellarExplorer(network, 'contract', v.address)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Open in Stellar Expert
              </a>
            </div>
          </div>
        </Disclosure>
      </div>

      <div
        className="mt-3 pt-3 flex items-center justify-between gap-2 flex-wrap"
        style={{ borderTop: '1px solid rgba(13, 45, 76, 0.06)' }}
      >
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onAction('deposit')}
            className="px-3 py-1.5 rounded-full bg-primary text-white text-xs font-semibold hover:bg-primary-dark transition-all"
          >
            Deposit
          </button>
          <button
            type="button"
            onClick={() => onAction('withdraw')}
            disabled={empty}
            title={empty ? 'This vault holds nothing to take out' : undefined}
            className="px-3 py-1.5 rounded-full bg-bg text-text text-xs font-semibold ring-1 ring-primary/20 hover:bg-bg/70 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Withdraw
          </button>
        </div>
        <button
          type="button"
          onClick={onHide}
          title="Hide it from this list. The vault stays on-chain."
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text"
        >
          <EyeOff size={13} />
          Hide
        </button>
      </div>
    </Card>
  )
}
