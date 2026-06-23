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

// activity feed: swaps show a token amount, everything else shows USD
export function formatActivityAmount(type: string, amount: number, token?: string): string {
  if (type === 'swap') return `${amount.toLocaleString()} ${token ?? ''}`.trim()
  if (Math.abs(amount) >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`
  if (Math.abs(amount) >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`
  return `$${amount.toFixed(2)}`
}

// short "Ns ago / Nm ago / Nh ago" given a unix seconds or millis timestamp
export function formatRelativeAgo(input: { unixSec?: number; ms?: number }): string {
  const ms = input.ms ?? (input.unixSec ? input.unixSec * 1000 : Date.now())
  const diffSec = (Date.now() - ms) / 1000
  if (diffSec < 60) return `${Math.floor(diffSec)}s ago`
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  return `${Math.floor(diffSec / 3600)}h ago`
}

// compact USD: $1.2M / $3.4K / $5.67
export function formatUSD(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`
  return `$${n.toFixed(2)}`
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

// short "Xs ago" / "Xm ago" / "Xh ago" from a raw millisecond delta
export function formatAgeMs(ms: number): string {
  if (ms < 1000) return 'just now'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  return `${h}h ago`
}
