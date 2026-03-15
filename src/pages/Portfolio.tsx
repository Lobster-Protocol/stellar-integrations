import { useWallet } from '../contexts/WalletContext'
import lobsterIcon from '../assets/lobster-icon.png'
import { USER_POSITIONS, formatUSD, formatNumber } from '../data/pools'
import ProtocolBadge from '../components/ProtocolBadge'
import ScoreBar from '../components/ScoreBar'
import { timeSince, cn } from '../utils/format'

export default function Portfolio() {
  const { address, connect } = useWallet()

  if (!address) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <img src={lobsterIcon} alt="" className="w-16 h-16 opacity-80" />
        <h2 className="text-xl font-semibold text-text">Connect your wallet</h2>
        <p className="text-text-secondary text-sm max-w-md text-center">
          Connect a Stellar wallet to view and manage your liquidity positions across Soroswap, Aquarius and Phoenix.
        </p>
        <button
          onClick={() => connect()}
          className="mt-2 px-6 py-2.5 rounded-full bg-primary hover:bg-primary-dark text-white font-semibold transition-all hover:-translate-y-0.5"
          style={{ boxShadow: '0 10px 25px rgba(54, 147, 251, 0.25)' }}
        >
          Connect Wallet
        </button>
      </div>
    )
  }

  const totalValue = USER_POSITIONS.reduce((s, p) => s + p.currentValue, 0)
  const totalPnL = USER_POSITIONS.reduce((s, p) => s + p.pnl, 0)
  const totalPnLPercent = totalValue > 0 ? (totalPnL / (totalValue - totalPnL)) * 100 : 0

  return (
    <div className="space-y-8">
      {/* hero card */}
      <div
        className="rounded-3xl p-6 sm:p-8"
        style={{
          background: 'radial-gradient(circle at top right, rgba(54, 147, 251, 0.35), transparent 55%), radial-gradient(circle at left, rgba(255, 135, 112, 0.3), transparent 60%), #ffffff',
          border: '1px solid rgba(13, 45, 76, 0.08)',
          boxShadow: '0 12px 35px rgba(8, 10, 12, 0.08)',
        }}
      >
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <p className="text-text-secondary text-sm mb-1">Total Portfolio Value</p>
            <p className="text-3xl font-bold text-text" style={{ fontFamily: 'Outfit, Poppins, sans-serif' }}>{formatUSD(totalValue)}</p>
          </div>
          <div className="text-right">
            <p className="text-text-secondary text-sm mb-1">Unrealized P&L</p>
            <p className={cn('text-xl font-semibold', totalPnL >= 0 ? 'text-green' : 'text-red')}>
              {totalPnL >= 0 ? '+' : ''}{formatUSD(totalPnL)}
              <span className="text-sm ml-1">({totalPnLPercent >= 0 ? '+' : ''}{totalPnLPercent.toFixed(2)}%)</span>
            </p>
          </div>
        </div>
      </div>

      {/* positions */}
      <div>
        <h2 className="text-lg font-semibold text-text mb-4">Active Positions</h2>
        <div className="grid gap-4">
          {USER_POSITIONS.map(pos => (
            <div
              key={pos.id}
              className="bg-bg-card rounded-3xl p-5 transition-all hover:-translate-y-0.5"
              style={{ border: '1px solid rgba(13, 45, 76, 0.08)', boxShadow: '0 12px 35px rgba(8, 10, 12, 0.08)' }}
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-lg font-semibold text-text">
                      {pos.token0Symbol}/{pos.token1Symbol}
                    </span>
                    <ProtocolBadge protocol={pos.protocol} />
                    <span className="text-xs text-text-muted">{timeSince(pos.entryDate)}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                    <div>
                      <span className="text-text-muted">Deposited</span>
                      <p className="text-text-secondary">{formatUSD(pos.depositedValue)}</p>
                    </div>
                    <div>
                      <span className="text-text-muted">Current Value</span>
                      <p className="text-text font-medium">{formatUSD(pos.currentValue)}</p>
                    </div>
                    <div>
                      <span className="text-text-muted">{pos.token0Symbol}</span>
                      <p className="text-text-secondary">{formatNumber(pos.token0Amount)}</p>
                    </div>
                    <div>
                      <span className="text-text-muted">{pos.token1Symbol}</span>
                      <p className="text-text-secondary">{formatNumber(pos.token1Amount)}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-3 min-w-[140px]">
                  <div className="text-right">
                    <p className={cn('text-lg font-semibold', pos.pnl >= 0 ? 'text-green' : 'text-red')}>
                      {pos.pnl >= 0 ? '+' : ''}{formatUSD(pos.pnl)}
                    </p>
                    <p className={cn('text-xs', pos.pnlPercent >= 0 ? 'text-green' : 'text-red')}>
                      {pos.pnlPercent >= 0 ? '+' : ''}{pos.pnlPercent.toFixed(2)}%
                    </p>
                  </div>
                  <div className="w-full space-y-1">
                    <ScoreBar value={pos.poolScore} label="Pool Score" />
                  </div>
                  <p className="text-xs text-text-muted">APR: <span className="text-green font-medium">{pos.apr}%</span></p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
