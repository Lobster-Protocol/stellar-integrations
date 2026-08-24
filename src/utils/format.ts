import type { Network } from '../config/contracts'

// stellar.expert uses 'public' for mainnet, 'testnet' for testnet
export function stellarExplorer(
  network: Network,
  kind: 'tx' | 'contract' | 'account',
  id: string,
): string {
  const seg = network === 'mainnet' ? 'public' : 'testnet'
  return `https://stellar.expert/explorer/${seg}/${kind}/${id}`
}

export function shortenAddress(addr: string, head = 4, tail = head) {
  if (!addr) return ''
  return addr.slice(0, head) + '...' + addr.slice(-tail)
}

// poor man's clsx
export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
}

// short "Ns ago / Nm ago / Nh ago" given a unix seconds or millis timestamp
export function formatRelativeAgo(input: { unixSec?: number; ms?: number }): string {
  const ms = input.ms ?? (input.unixSec ? input.unixSec * 1000 : Date.now())
  const diffSec = (Date.now() - ms) / 1000
  if (diffSec < 60) return `${Math.floor(diffSec)}s ago`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  return `${Math.floor(diffSec / 3600)}h ago`
}

// compact magnitude: 1.2M / 3.4K / 5.67
export function compactNumber(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toFixed(2)
}

export function formatUSD(n: number): string {
  return `$${compactNumber(n)}`
}

// A portfolio total is quoted in the network's USDC. On mainnet that is money
// and takes a dollar sign; on testnet it is a test token, and printing "$" for
// it would read as a dollar value the wallet does not hold.
export function formatValue(n: number, unit: 'USD' | 'USDC'): string {
  return unit === 'USD' ? formatUSD(n) : `${compactNumber(n)} USDC`
}

// horizon balances are 7-decimal fixed point; 2dp above 1, up to 7 below
export function formatBalance(raw: string): string {
  const n = Number(raw)
  if (!Number.isFinite(n)) return raw
  if (n === 0) return '0.00'
  if (Math.abs(n) >= 1) {
    return n.toLocaleString('en-US', { maximumFractionDigits: 4, minimumFractionDigits: 2 })
  }
  return n.toLocaleString('en-US', { maximumFractionDigits: 7, minimumFractionDigits: 4 })
}
