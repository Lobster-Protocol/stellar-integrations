import { useState } from 'react'
import { POOLS, formatUSD } from '../data/pools'
import ProtocolBadge from '../components/ProtocolBadge'
import ScoreBar from '../components/ScoreBar'
import { cn } from '../utils/format'

const PAIR_OPTIONS = [...new Set(POOLS.map(p => `${p.token0Symbol}/${p.token1Symbol}`))]

export default function Analytics() {
  const [selectedPair, setSelectedPair] = useState(PAIR_OPTIONS[0])

  const pairPools = POOLS.filter(p => `${p.token0Symbol}/${p.token1Symbol}` === selectedPair)
  const bestPool = pairPools.reduce((best, p) => p.poolScore > best.poolScore ? p : best, pairPools[0])

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-text mb-4">Cross-DEX Pool Comparison</h2>
        <div className="flex flex-wrap gap-2">
          {PAIR_OPTIONS.map(pair => (
            <button
              key={pair}
              onClick={() => setSelectedPair(pair)}
              className={cn(
                'px-4 py-2 rounded-full text-sm font-medium transition-all',
                selectedPair === pair
                  ? 'bg-primary text-white shadow-sm'
                  : 'bg-bg-card text-text-secondary hover:text-text'
              )}
              style={selectedPair !== pair ? { border: '1px solid rgba(13, 45, 76, 0.08)' } : undefined}
            >
              {pair}
            </button>
          ))}
        </div>
      </div>

      {pairPools.length > 1 ? (
        <div className="grid md:grid-cols-3 gap-4">
          {pairPools.map(pool => {
            const isBest = pool.id === bestPool.id
            return (
              <div
                key={pool.id}
                className={cn(
                  'rounded-3xl p-5 transition-all relative',
                  isBest ? 'ring-2 ring-primary/30' : ''
                )}
                style={{
                  background: isBest
                    ? 'linear-gradient(135deg, rgba(54, 147, 251, 0.08), rgba(255, 135, 112, 0.05))'
                    : '#ffffff',
                  border: '1px solid rgba(13, 45, 76, 0.08)',
                  boxShadow: '0 12px 35px rgba(8, 10, 12, 0.08)',
                }}
              >
                {isBest && (
                  <span className="absolute -top-2.5 left-4 px-2.5 py-0.5 bg-primary text-white text-[10px] font-bold uppercase rounded-full tracking-wider">
                    Best Score
                  </span>
                )}
                <div className="flex items-center justify-between mb-4">
                  <ProtocolBadge protocol={pool.protocol} />
                  <span className="text-2xl font-bold text-text" style={{ fontFamily: 'Outfit' }}>{pool.poolScore}</span>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted">TVL</span>
                    <span className="text-text-secondary">{formatUSD(pool.tvl)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted">Volume 24h</span>
                    <span className="text-text-secondary">{formatUSD(pool.volume24h)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted">APR</span>
                    <span className="text-green font-medium">{pool.apr}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted">Fee</span>
                    <span className="text-text-secondary">{pool.fee}%</span>
                  </div>
                  <hr className="border-border" />
                  <ScoreBar value={pool.efficiency} label="Efficiency" size="md" />
                  <ScoreBar value={pool.profitability} label="Profitability" size="md" />
                  <ScoreBar value={pool.stability} label="Stability" size="md" />
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <SinglePoolView pool={pairPools[0]} />
      )}

      {pairPools.length > 1 && (
        <MigrationInsight pools={pairPools} bestPool={bestPool} />
      )}
    </div>
  )
}

function SinglePoolView({ pool }: { pool: typeof POOLS[0] }) {
  return (
    <div className="bg-bg-card rounded-3xl p-6" style={{ border: '1px solid rgba(13, 45, 76, 0.08)', boxShadow: '0 12px 35px rgba(8, 10, 12, 0.08)' }}>
      <div className="flex items-center gap-3 mb-4">
        <ProtocolBadge protocol={pool.protocol} />
        <span className="text-lg font-semibold text-text">{pool.token0Symbol}/{pool.token1Symbol}</span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
        <div><p className="text-text-muted text-xs mb-1">TVL</p><p className="text-text font-medium">{formatUSD(pool.tvl)}</p></div>
        <div><p className="text-text-muted text-xs mb-1">Volume 24h</p><p className="text-text font-medium">{formatUSD(pool.volume24h)}</p></div>
        <div><p className="text-text-muted text-xs mb-1">APR</p><p className="text-green font-medium">{pool.apr}%</p></div>
        <div><p className="text-text-muted text-xs mb-1">Pool Score</p><p className="text-text font-medium">{pool.poolScore}/100</p></div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4">
        <ScoreBar value={pool.efficiency} label="Efficiency" size="md" />
        <ScoreBar value={pool.profitability} label="Profitability" size="md" />
        <ScoreBar value={pool.stability} label="Stability" size="md" />
      </div>
    </div>
  )
}

function MigrationInsight({ pools, bestPool }: { pools: typeof POOLS, bestPool: typeof POOLS[0] }) {
  const others = pools.filter(p => p.id !== bestPool.id)
  const avgDelta = others.reduce((s, p) => s + (bestPool.apr - p.apr), 0) / others.length

  // FIXME: doesn't account for IL, slippage, or actual gas costs yet
  const positionSize = 50000
  const fee = 0.1 // $0.10 migration cost on Stellar
  const recoveryDays = (365 * fee) / (positionSize * (avgDelta / 100))

  return (
    <div className="bg-bg-card rounded-3xl p-5" style={{ border: '1px solid rgba(13, 45, 76, 0.08)', boxShadow: '0 12px 35px rgba(8, 10, 12, 0.08)' }}>
      <h3 className="text-sm font-semibold text-text mb-3">Migration Analysis</h3>
      <p className="text-sm text-text-secondary leading-relaxed">
        For a <span className="text-text font-medium">{formatUSD(positionSize)}</span> position,
        migrating to <span className="text-text font-medium capitalize">{bestPool.protocol}</span> ({bestPool.apr}% APR)
        from the current average ({(bestPool.apr - avgDelta).toFixed(1)}% APR) would recover the migration cost
        in <span className={cn('font-medium', recoveryDays < 1 ? 'text-green' : 'text-primary')}>
          {recoveryDays < 1 ? 'less than a day' : `${recoveryDays.toFixed(1)} days`}
        </span>.
      </p>
      <p className="text-xs text-text-muted mt-2">
        Based on Lobster arbitrage condition: 365 * fee / (position * deltaAPR). Migration fee: $0.10.
      </p>
    </div>
  )
}
