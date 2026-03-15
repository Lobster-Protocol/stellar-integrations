// mock data generator for the dashboard
// simulates ~6 months of a Lobster strategy on Stellar
// two tokens (XLM/USDC), rotating between Soroswap, Aquarius, Phoenix pools

export type Protocol = 'soroswap' | 'phoenix' | 'aquarius'
export type ActivityType = 'migration' | 'swap' | 'deposit' | 'withdraw' | 'bridge_in' | 'bridge_out'
export type TimeRange = '1D' | '1W' | '1M' | '3M' | '6M' | 'ALL'

export interface DailySnapshot {
  date: string
  portfolioValue: number
  pnl: number
  pnlPercent: number
  token0Amount: number // XLM
  token1Amount: number // USDC
  token0Ratio: number // 0-100
  activePool: string
  activeProtocol: Protocol
  fees: number
  il: number
  apr: number
}

export interface ActivityEvent {
  id: string
  date: string
  type: ActivityType
  fromPool?: string
  toPool?: string
  fromProtocol?: Protocol
  toProtocol?: Protocol
  amount?: number
  token?: string
  txHash: string
  reason?: string
  chain?: string
}

export interface BridgeEvent {
  id: string
  date: string
  direction: 'in' | 'out'
  sourceChain: string
  destChain: string
  token: string
  amount: number
  status: 'completed' | 'pending'
  txHash: string
}

export interface StrategyConfig {
  id: string
  name: string
  token0: string
  token1: string
  token0Symbol: string
  token1Symbol: string
  depositedValue: number
  currentValue: number
  startDate: string
  activeProtocol: Protocol
  activePool: string
}

// deterministic pseudo-random so the charts don't jump on every refresh
function seededRandom(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807 + 0) % 2147483647
    return (s - 1) / 2147483646
  }
}

function generatePnlCurve(days: number, finalPnlPercent: number): number[] {
  const rand = seededRandom(42)
  const curve: number[] = [0]
  const dailyDrift = finalPnlPercent / days
  const volatility = 0.3

  for (let i = 1; i < days; i++) {
    const noise = (rand() - 0.48) * volatility
    const prev = curve[i - 1]
    let next = prev + dailyDrift + noise

    // occasional small drawdowns
    if (rand() < 0.08) {
      next = prev - rand() * 0.4
    }
    curve.push(next)
  }
  return curve
}

// pool names
const POOLS = [
  { name: 'XLM/USDC 0.3%', protocol: 'aquarius' as Protocol },
  { name: 'XLM/USDC 0.3%', protocol: 'soroswap' as Protocol },
  { name: 'XLM/USDC 0.3%', protocol: 'phoenix' as Protocol },
  { name: 'XLM/USDC 0.1%', protocol: 'aquarius' as Protocol },
]

const _pickRand = seededRandom(123)
function pickPool(exclude?: string): typeof POOLS[0] {
  const available = exclude ? POOLS.filter(p => p.name + p.protocol !== exclude) : POOLS
  return available[Math.floor(_pickRand() * available.length)]
}

const _snapRand = seededRandom(777)

// generate daily snapshots
export function generateSnapshots(): DailySnapshot[] {
  const days = 180
  const startDate = new Date('2025-09-15')
  const depositValue = 100000
  const pnlCurve = generatePnlCurve(days, 12.6) // ~12.6% over 6 months

  let currentPool = POOLS[0]
  let cumulativeFees = 0
  let cumulativeIL = 0

  return pnlCurve.map((pnl, i) => {
    const date = new Date(startDate)
    date.setDate(date.getDate() + i)
    const value = depositValue * (1 + pnl / 100)

    // simulate pool migrations every ~25 days
    if (i > 0 && i % 25 === 0) {
      currentPool = pickPool(currentPool.name + currentPool.protocol)
    }

    const dailyFee = value * 0.0003 * (0.7 + _snapRand() * 0.6) // ~0.03% daily fees
    cumulativeFees += dailyFee
    const dailyIL = value * 0.00008 * _snapRand()
    cumulativeIL += dailyIL

    // token ratio oscillates around 50/50 with drift
    const baseRatio = 50 + Math.sin(i / 20) * 5 + (_snapRand() - 0.5) * 3
    const ratio = Math.max(35, Math.min(65, baseRatio))

    const token1Value = value * (ratio / 100) // USDC portion
    const token0Value = value - token1Value // XLM portion
    const xlmPrice = 0.38 + Math.sin(i / 30) * 0.04 + (_snapRand() - 0.5) * 0.02

    return {
      date: date.toISOString().split('T')[0],
      portfolioValue: Math.round(value * 100) / 100,
      pnl: Math.round((value - depositValue) * 100) / 100,
      pnlPercent: Math.round(pnl * 100) / 100,
      token0Amount: Math.round(token0Value / xlmPrice),
      token1Amount: Math.round(token1Value * 100) / 100,
      token0Ratio: Math.round(ratio * 10) / 10,
      activePool: currentPool.name,
      activeProtocol: currentPool.protocol,
      fees: Math.round(cumulativeFees * 100) / 100,
      il: Math.round(cumulativeIL * 100) / 100,
      apr: Math.round((pnl / Math.max(1, i)) * 365 * 100) / 100,
    }
  })
}

// generate activity events
export function generateActivity(): ActivityEvent[] {
  const events: ActivityEvent[] = []
  const startDate = new Date('2025-09-15')

  // initial deposit
  events.push({
    id: 'act-0',
    date: '2025-09-15',
    type: 'deposit',
    amount: 100000,
    token: 'USDC',
    txHash: 'a3f8c2d1e5b7...9k4m',
  })

  // bridge in from Ethereum
  events.push({
    id: 'act-1',
    date: '2025-09-15',
    type: 'bridge_in',
    amount: 100000,
    token: 'USDC',
    chain: 'Ethereum',
    txHash: 'b7d2f4a8c1e3...6n9p',
  })

  // pool migrations
  const migrations: [string, Protocol, string, Protocol, string][] = [
    ['2025-10-10', 'aquarius', 'soroswap', 'soroswap', 'Higher fee yield on Soroswap (+3.2% APR delta)'],
    ['2025-11-04', 'soroswap', 'phoenix', 'phoenix', 'Phoenix pool shows better stability score'],
    ['2025-11-29', 'phoenix', 'aquarius', 'aquarius', 'Aquarius 0.1% pool more efficient for current volume'],
    ['2025-12-24', 'aquarius', 'soroswap', 'soroswap', 'Soroswap volume spike, fee capture opportunity'],
    ['2026-01-18', 'soroswap', 'aquarius', 'aquarius', 'Rebalancing to stable pool after volatility event'],
    ['2026-02-12', 'aquarius', 'phoenix', 'phoenix', 'Phoenix APR delta exceeds recovery threshold'],
    ['2026-03-09', 'phoenix', 'aquarius', 'aquarius', 'Migration back to highest pool score'],
  ]

  migrations.forEach(([date, fromP, toP, , reason], i) => {
    events.push({
      id: `mig-${i}`,
      date,
      type: 'migration',
      fromPool: `XLM/USDC 0.3%`,
      toPool: `XLM/USDC 0.3%`,
      fromProtocol: fromP as Protocol,
      toProtocol: toP as Protocol,
      txHash: `${_snapRand().toString(36).slice(2, 10)}...${_snapRand().toString(36).slice(2, 6)}`,
      reason,
    })
  })

  // arbitrage swaps (roughly every 3-5 days)
  for (let d = 5; d < 180; d += 3 + Math.floor(_snapRand() * 4)) {
    const date = new Date(startDate)
    date.setDate(date.getDate() + d)
    const isXlmToUsdc = _snapRand() > 0.5
    const amount = 500 + Math.floor(_snapRand() * 2500)

    events.push({
      id: `swap-${d}`,
      date: date.toISOString().split('T')[0],
      type: 'swap',
      amount,
      token: isXlmToUsdc ? 'XLM' : 'USDC',
      txHash: `${_snapRand().toString(36).slice(2, 10)}...${_snapRand().toString(36).slice(2, 6)}`,
      reason: isXlmToUsdc ? 'Delta rebalance: XLM overweight' : 'Delta rebalance: USDC overweight',
    })
  }

  // sort by date
  events.sort((a, b) => a.date.localeCompare(b.date))
  return events
}

export function generateBridgeEvents(): BridgeEvent[] {
  return [
    {
      id: 'br-1',
      date: '2025-09-15',
      direction: 'in',
      sourceChain: 'Ethereum',
      destChain: 'Stellar',
      token: 'USDC',
      amount: 100000,
      status: 'completed',
      txHash: 'b7d2f4a8c1e3...6n9p',
    },
    {
      id: 'br-2',
      date: '2025-11-20',
      direction: 'in',
      sourceChain: 'Arbitrum',
      destChain: 'Stellar',
      token: 'USDC',
      amount: 25000,
      status: 'completed',
      txHash: 'f2a9d7b3e8c1...4k7j',
    },
    {
      id: 'br-3',
      date: '2026-01-05',
      direction: 'out',
      sourceChain: 'Stellar',
      destChain: 'Ethereum',
      token: 'USDC',
      amount: 10000,
      status: 'completed',
      txHash: 'c8e3f1a5d7b2...9m2n',
    },
    {
      id: 'br-4',
      date: '2026-02-28',
      direction: 'in',
      sourceChain: 'Base',
      destChain: 'Stellar',
      token: 'USDC',
      amount: 15000,
      status: 'completed',
      txHash: 'h4j6k8l2m3n5...7p9q',
    },
  ]
}

export const STRATEGY: StrategyConfig = {
  id: 'strat-xlm-usdc',
  name: 'XLM/USDC Yield Optimizer',
  token0: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
  token1: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
  token0Symbol: 'XLM',
  token1Symbol: 'USDC',
  depositedValue: 100000,
  currentValue: 112600,
  startDate: '2025-09-15',
  activeProtocol: 'aquarius',
  activePool: 'XLM/USDC 0.3%',
}

// KPIs computed from snapshots
export function computeKPIs(snapshots: DailySnapshot[]) {
  if (!snapshots.length) return null
  const last = snapshots[snapshots.length - 1]
  const first = snapshots[0]

  // max drawdown
  let peak = -Infinity
  let maxDD = 0
  for (const s of snapshots) {
    if (s.pnlPercent > peak) peak = s.pnlPercent
    const dd = peak - s.pnlPercent
    if (dd > maxDD) maxDD = dd
  }

  // sharpe (simplified daily returns)
  const returns: number[] = []
  for (let i = 1; i < snapshots.length; i++) {
    const r = (snapshots[i].portfolioValue - snapshots[i - 1].portfolioValue) / snapshots[i - 1].portfolioValue
    returns.push(r)
  }
  const meanReturn = returns.reduce((s, r) => s + r, 0) / returns.length
  const variance = returns.reduce((s, r) => s + (r - meanReturn) ** 2, 0) / returns.length
  const stdDev = Math.sqrt(variance)
  const sharpe = stdDev > 0 ? (meanReturn / stdDev) * Math.sqrt(365) : 0

  return {
    totalPnl: last.pnl,
    totalPnlPercent: last.pnlPercent,
    sharpe: Math.round(sharpe * 100) / 100,
    maxDrawdown: Math.round(maxDD * 100) / 100,
    apr: last.apr,
    totalFees: last.fees,
    totalIL: last.il,
    netFees: Math.round((last.fees - last.il) * 100) / 100,
    currentValue: last.portfolioValue,
    deposited: first.portfolioValue,
    daysActive: snapshots.length,
    migrations: 7, // hardcoded, matches generateActivity
    swaps: Math.floor(180 / 4), // rough
  }
}

// filter snapshots by time range
export function filterByRange(snapshots: DailySnapshot[], range: TimeRange): DailySnapshot[] {
  if (range === 'ALL') return snapshots
  const now = new Date(snapshots[snapshots.length - 1].date)
  const daysMap: Record<TimeRange, number> = { '1D': 1, '1W': 7, '1M': 30, '3M': 90, '6M': 180, 'ALL': 9999 }
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() - daysMap[range])
  return snapshots.filter(s => new Date(s.date) >= cutoff)
}

// protocol display helpers -- keeping these here since they're used everywhere
// (probably should be in utils but too many imports depend on this path already)
export function getProtocolColor(p: Protocol): string {
  switch (p) {
    case 'soroswap': return '#3b82f6'
    case 'aquarius': return '#9333ea'
    case 'phoenix': return '#f97316'
  }
}

export function getProtocolLabel(p: Protocol): string {
  switch (p) {
    case 'soroswap': return 'Soroswap'
    case 'aquarius': return 'Aquarius'
    case 'phoenix': return 'Phoenix'
  }
}

export function formatUSD(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}
