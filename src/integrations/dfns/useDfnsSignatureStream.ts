import { useEffect, useRef, useState } from 'react'

import { DfnsEventKindSchema, type DfnsEvent, type DfnsEventKind } from './types'
import { useActiveRelay } from './use-profiles'

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
  const relay = useActiveRelay()
  const profileId = relay?.profileId
  const baseUrl = relay?.baseUrl
  const apiToken = relay?.apiToken

  // a profile switch starts a fresh feed, so the previous profile's events never
  // linger under the new one. reset during render (react's documented way to
  // derive state from a changed input), not in the effect.
  const seenProfile = useRef(profileId)
  if (seenProfile.current !== profileId) {
    seenProfile.current = profileId
    setEvents([])
  }

  useEffect(() => {
    // the old stream (and its token in the url) is torn down by the cleanup below.
    if (!baseUrl) return
    // EventSource can't set headers, so the token rides as a query param
    const url = apiToken ? `${baseUrl}/sse?token=${encodeURIComponent(apiToken)}` : `${baseUrl}/sse`
    const es = new EventSource(url)
    const handler = (e: MessageEvent) => {
      try {
        const evt = JSON.parse(e.data) as DfnsEvent
        if (typeof evt.id !== 'string' || !DfnsEventKindSchema.safeParse(evt.kind).success) return
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
  }, [profileId, baseUrl, apiToken])

  return events
}
