import { useEffect, useState } from 'react'

import { readRoutingLog, ROUTING_LOG_KEY, type RoutingEntry } from './routing-log'

// a same-tab write doesn't fire 'storage', so poll as well
export function useRoutingLog(): RoutingEntry[] {
  const [entries, setEntries] = useState<RoutingEntry[]>(() => readRoutingLog())
  useEffect(() => {
    const sync = () => setEntries(readRoutingLog())
    const onStorage = (e: StorageEvent) => {
      if (e.key === ROUTING_LOG_KEY) sync()
    }
    window.addEventListener('storage', onStorage)
    const id = setInterval(sync, 5_000)
    return () => {
      window.removeEventListener('storage', onStorage)
      clearInterval(id)
    }
  }, [])
  return entries
}
