export function shortenAddress(addr: string, chars = 4) {
  if (!addr) return ''
  return addr.slice(0, chars) + '...' + addr.slice(-chars)
}

// poor man's clsx
export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ')
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
