import { useMemo } from 'react'
import { generateBridgeEvents, formatUSD } from '../data/mock'
import { cn } from '../utils/format'

// chain colors (inspired by the Python dashboard)
const CHAIN_COLORS: Record<string, string> = {
  Ethereum: '#627EEA',
  Arbitrum: '#FF6B35',
  Base: '#27AE60',
  Stellar: '#3693fb',
}

export default function Bridges() {
  const events = useMemo(() => generateBridgeEvents(), [])

  const totalIn = events.filter(e => e.direction === 'in').reduce((s, e) => s + e.amount, 0)
  const totalOut = events.filter(e => e.direction === 'out').reduce((s, e) => s + e.amount, 0)
  const netFlow = totalIn - totalOut

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-text">Cross-Chain Bridges</h2>

      {/* flow summary */}
      <div className="grid grid-cols-3 gap-4">
        <FlowCard label="Total Inflow" value={formatUSD(totalIn)} color="#10b981" />
        <FlowCard label="Total Outflow" value={formatUSD(totalOut)} color="#ef4444" />
        <FlowCard label="Net Flow" value={`${netFlow >= 0 ? '+' : ''}${formatUSD(netFlow)}`} color={netFlow >= 0 ? '#10b981' : '#ef4444'} />
      </div>

      {/* bridge provider */}
      <div className="bg-bg-card rounded-3xl p-5 card">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-text">Bridge Provider</h3>
          {/* TODO: support multiple bridge providers */}
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
            Allbridge Core
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-text-muted text-xs">Supported Token</p>
            <p className="text-text font-medium">USDC</p>
          </div>
          <div>
            <p className="text-text-muted text-xs">Avg Bridge Time</p>
            <p className="text-text font-medium">~2 min</p>
          </div>
          <div>
            <p className="text-text-muted text-xs">Bridge Fee</p>
            <p className="text-text font-medium">0.15%</p>
          </div>
          <div>
            <p className="text-text-muted text-xs">Trustline Status</p>
            <p className="text-green font-medium">Active</p>
          </div>
        </div>
      </div>

      {/* transaction history */}
      <div className="bg-bg-card rounded-3xl overflow-hidden" style={{ border: '1px solid rgba(13, 45, 76, 0.08)', boxShadow: '0 12px 35px rgba(8, 10, 12, 0.08)' }}>
        <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(13, 45, 76, 0.08)' }}>
          <h3 className="text-sm font-semibold text-text">Bridge History</h3>
        </div>

        <div className="divide-y" style={{ borderColor: 'rgba(13, 45, 76, 0.06)' }}>
          {events.map(event => (
            <div key={event.id} className="px-5 py-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white',
                  event.direction === 'in' ? 'bg-green' : 'bg-red'
                )}>
                  {event.direction === 'in' ? '↓' : '↑'}
                </span>
                <div>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium" style={{ color: CHAIN_COLORS[event.sourceChain] || '#6d7f9c' }}>
                      {event.sourceChain}
                    </span>
                    <span className="text-text-muted">→</span>
                    <span className="font-medium" style={{ color: CHAIN_COLORS[event.destChain] || '#6d7f9c' }}>
                      {event.destChain}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted font-mono">{event.txHash}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-text">{event.amount.toLocaleString()} {event.token}</p>
                <div className="flex items-center gap-2 justify-end">
                  <span className="text-xs text-text-muted">{event.date}</span>
                  <span className={cn(
                    'px-1.5 py-0.5 rounded text-[10px] font-medium',
                    event.status === 'completed' ? 'bg-green/10 text-green' : 'bg-yellow/10 text-yellow'
                  )}>
                    {event.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function FlowCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-3xl p-5" style={{ background: 'linear-gradient(135deg, rgba(54, 147, 251, 0.12), rgba(255, 135, 112, 0.08))', border: '1px solid rgba(13, 45, 76, 0.06)' }}>
      <p className="text-text-secondary text-xs uppercase tracking-wider mb-1.5 font-medium">{label}</p>
      <p className="text-xl font-bold" style={{ color, fontFamily: 'Outfit' }}>{value}</p>
    </div>
  )
}
