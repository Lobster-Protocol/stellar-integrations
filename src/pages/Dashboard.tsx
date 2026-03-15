import { POOLS, USER_POSITIONS, formatUSD } from '../data/pools'
import { useWallet } from '../contexts/WalletContext'
import StatCard from '../components/StatCard'
import ProtocolBadge from '../components/ProtocolBadge'
import ScoreBar from '../components/ScoreBar'
import { cn } from '../utils/format'

// TODO: replace mock data with live feed from our indexer API
// see DataProcess/src/api.ts GET /data/last endpoint
export default function Dashboard() {
  const { address } = useWallet()

  const totalTVL = POOLS.reduce((s, p) => s + p.tvl, 0)
  const totalVol = POOLS.reduce((s, p) => s + p.volume24h, 0)
  const avgAPR = POOLS.reduce((s, p) => s + p.apr, 0) / POOLS.length
  const portfolioValue = USER_POSITIONS.reduce((s, p) => s + p.currentValue, 0)

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-text mb-4">Overview</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Indexed TVL" value={formatUSD(totalTVL)} sub="across 3 DEXs" />
          <StatCard label="24h Volume" value={formatUSD(totalVol)} trend={5.2} />
          <StatCard label="Avg Pool APR" value={`${avgAPR.toFixed(1)}%`} trend={1.4} />
          <StatCard
            label="Your Portfolio"
            value={address ? formatUSD(portfolioValue) : '—'}
            sub={address ? `${USER_POSITIONS.length} positions` : 'connect wallet'}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text">Pool Rankings</h2>
          <span className="text-xs text-text-muted">{POOLS.length} pools indexed</span>
        </div>
        <div className="bg-bg-card rounded-3xl overflow-hidden" style={{ border: '1px solid rgba(13, 45, 76, 0.08)', boxShadow: '0 12px 35px rgba(8, 10, 12, 0.08)' }}>
          <table className="w-full">
            <thead>
              <tr className="text-xs text-text-muted uppercase tracking-wider" style={{ borderBottom: '1px solid rgba(13, 45, 76, 0.08)' }}>
                <th className="text-left px-5 py-3 font-medium">Pool</th>
                <th className="text-left px-5 py-3 font-medium hidden sm:table-cell">Protocol</th>
                <th className="text-right px-5 py-3 font-medium">TVL</th>
                <th className="text-right px-5 py-3 font-medium hidden md:table-cell">Volume 24h</th>
                <th className="text-right px-5 py-3 font-medium">APR</th>
                <th className="text-right px-5 py-3 font-medium hidden lg:table-cell">Score</th>
              </tr>
            </thead>
            <tbody>
              {[...POOLS].sort((a, b) => b.poolScore - a.poolScore).map((pool, i) => (
                <tr key={pool.id} className={cn('hover:bg-bg/50 transition-colors', i < POOLS.length - 1 && 'border-b border-border')}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-text text-sm">
                        {pool.token0Symbol}/{pool.token1Symbol}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4 hidden sm:table-cell">
                    <ProtocolBadge protocol={pool.protocol} />
                  </td>
                  <td className="text-right px-5 py-4 text-sm text-text-secondary">{formatUSD(pool.tvl)}</td>
                  <td className="text-right px-5 py-4 text-sm text-text-secondary hidden md:table-cell">{formatUSD(pool.volume24h)}</td>
                  <td className="text-right px-5 py-4">
                    <span className="text-sm font-medium text-green">{pool.apr.toFixed(1)}%</span>
                  </td>
                  <td className="px-5 py-4 hidden lg:table-cell w-32">
                    <ScoreBar value={pool.poolScore} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
