// TODO: pull from Mercury indexer API when ready
// for now using hardcoded data from our analytics engine snapshot

export type Protocol = 'soroswap' | 'phoenix' | 'aquarius'

export interface PoolMetrics {
  id: string
  token0: string
  token1: string
  token0Symbol: string
  token1Symbol: string
  protocol: Protocol
  tvl: number
  volume24h: number
  apr: number
  efficiency: number
  profitability: number
  stability: number
  poolScore: number
  fee: number
  // priceChange24h: number  // not using this yet
}

export interface UserPosition {
  id: string
  poolId: string
  token0Symbol: string
  token1Symbol: string
  protocol: Protocol
  depositedValue: number
  currentValue: number
  pnl: number
  pnlPercent: number
  apr: number
  poolScore: number
  entryDate: string
  token0Amount: number
  token1Amount: number
}

// simulated pool data based on actual Stellar DEX conditions
export const POOLS: PoolMetrics[] = [
  {
    id: 'soroswap-xlm-usdc',
    token0: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
    token1: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
    token0Symbol: 'XLM',
    token1Symbol: 'USDC',
    protocol: 'soroswap',
    tvl: 2_450_000,
    volume24h: 890_000,
    apr: 18.4,
    efficiency: 72,
    profitability: 68,
    stability: 81,
    poolScore: 74,
    fee: 0.3,
    // priceChange24h: 2.3,
  },
  {
    id: 'aquarius-xlm-usdc',
    token0: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
    token1: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
    token0Symbol: 'XLM',
    token1Symbol: 'USDC',
    protocol: 'aquarius',
    tvl: 8_900_000,
    volume24h: 2_100_000,
    apr: 14.7,
    efficiency: 65,
    profitability: 71,
    stability: 88,
    poolScore: 75,
    fee: 0.3,
    // priceChange24h: 2.3,
  },
  {
    id: 'phoenix-xlm-usdc',
    token0: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
    token1: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
    token0Symbol: 'XLM',
    token1Symbol: 'USDC',
    protocol: 'phoenix',
    tvl: 1_200_000,
    volume24h: 340_000,
    apr: 22.1,
    efficiency: 58,
    profitability: 74,
    stability: 69,
    poolScore: 67,
    fee: 0.3,
    // priceChange24h: 2.3,
  },
  {
    id: 'soroswap-xlm-aqua',
    token0: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
    token1: 'CAUIKL3IYGMERDRUN6YSCLWVAKIFG5Q4YJHUKM4S4MSJJ7BQADONSG6',
    token0Symbol: 'XLM',
    token1Symbol: 'AQUA',
    protocol: 'soroswap',
    tvl: 680_000,
    volume24h: 210_000,
    apr: 31.2,
    efficiency: 61,
    profitability: 77,
    stability: 52,
    poolScore: 63,
    fee: 0.3,
    // priceChange24h: -1.8,
  },
  {
    id: 'aquarius-usdc-eurc',
    token0: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7SJMI75',
    token1: 'CDTKPWPLOURQA2SGAALU6OAQRPVFNQSNJ6SIR2FALO44GR5RM6DKNBZG',
    token0Symbol: 'USDC',
    token1Symbol: 'EURC',
    protocol: 'aquarius',
    tvl: 3_100_000,
    volume24h: 950_000,
    apr: 8.9,
    efficiency: 82,
    profitability: 62,
    stability: 94,
    poolScore: 79,
    fee: 0.1,
    // priceChange24h: 0.1,
  },
  {
    id: 'phoenix-xlm-pho',
    token0: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
    token1: 'CBHBCJHBF45LGDPQ2KEQMQPVFTGVH3RVAUQFQWSIM5RBBFCBKHYGLHJ3',
    token0Symbol: 'XLM',
    token1Symbol: 'PHO',
    protocol: 'phoenix',
    tvl: 420_000,
    volume24h: 95_000,
    apr: 41.5,
    efficiency: 47,
    profitability: 82,
    stability: 38,
    poolScore: 56,
    fee: 0.3,
    // priceChange24h: -4.2,
  },
]

export const USER_POSITIONS: UserPosition[] = [
  {
    id: 'pos-1',
    poolId: 'aquarius-xlm-usdc',
    token0Symbol: 'XLM',
    token1Symbol: 'USDC',
    protocol: 'aquarius',
    depositedValue: 50_000,
    currentValue: 52_340,
    pnl: 2_340,
    pnlPercent: 4.68,
    apr: 14.7,
    poolScore: 75,
    entryDate: '2026-01-15',
    token0Amount: 125_000,
    token1Amount: 26_170,
  },
  {
    id: 'pos-2',
    poolId: 'phoenix-xlm-usdc',
    token0Symbol: 'XLM',
    token1Symbol: 'USDC',
    protocol: 'phoenix',
    depositedValue: 25_000,
    currentValue: 26_850,
    pnl: 1_850,
    pnlPercent: 7.4,
    apr: 22.1,
    poolScore: 67,
    entryDate: '2026-02-03',
    token0Amount: 64_200,
    token1Amount: 13_425,
  },
]

export function formatUSD(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(2)}`
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

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
