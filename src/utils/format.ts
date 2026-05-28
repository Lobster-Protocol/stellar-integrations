import type { CSSProperties } from 'react'

// the card chrome (border + soft shadow) we reuse on every panel
export const cardStyle: CSSProperties = {
  border: '1px solid rgba(13, 45, 76, 0.08)',
  boxShadow: '0 12px 35px rgba(8, 10, 12, 0.08)',
}

export function shortenAddress(addr: string, chars = 4) {
  if (!addr) return ''
  return addr.slice(0, chars) + '...' + addr.slice(-chars)
}

// poor man's clsx
export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
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

export function timeSince(dateStr: string) {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  // might break for future dates, fix later
  const intervals = [
    { label: 'y', seconds: 31536000 },
    { label: 'mo', seconds: 2592000 },
    { label: 'd', seconds: 86400 },
    { label: 'h', seconds: 3600 },
    { label: 'm', seconds: 60 },
  ]
  for (const i of intervals) {
    const count = Math.floor(seconds / i.seconds)
    if (count > 0) return `${count}${i.label} ago`
  }
  return 'just now'
}
