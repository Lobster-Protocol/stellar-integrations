import { useEffect, useState } from 'react'

import type { DfnsEvent, DfnsEventKind } from './types'

const MAX_EVENTS = 500

const SUBSCRIBED_KINDS: DfnsEventKind[] = [
  'wallet.signature.requested',
  'wallet.signature.signed',
  'wallet.signature.failed',
  'wallet.transaction.broadcasted',
  'wallet.transaction.confirmed',
  'wallet.transfer.confirmed',
  'policy.approval.pending',
  'policy.approval.resolved',
]

export function useDfnsSignatureStream(): DfnsEvent[] {
  const [events, setEvents] = useState<DfnsEvent[]>([])

  useEffect(() => {
    const base = import.meta.env.VITE_LOBSTER_API_URL
    if (!base) return
    // EventSource can't set headers, so the shared token rides as a query param
    const token = import.meta.env.VITE_LOBSTER_API_TOKEN
    const url = token ? `${base}/sse?token=${encodeURIComponent(token)}` : `${base}/sse`
    const es = new EventSource(url, { withCredentials: true })
    const handler = (e: MessageEvent) => {
      try {
        const evt = JSON.parse(e.data) as DfnsEvent
        setEvents((prev) => [evt, ...prev].slice(0, MAX_EVENTS))
      } catch {
        // server is the source of truth, skip malformed frames silently
      }
    }
    for (const k of SUBSCRIBED_KINDS) es.addEventListener(k, handler)
    return () => {
      for (const k of SUBSCRIBED_KINDS) es.removeEventListener(k, handler)
      es.close()
    }
  }, [])

  return events
}
