import { useEffect } from 'react'

// transfers the bridge window is showing: their status is already on screen, so no toast for them
const onScreen = new Map<string, number>()

export function useOnScreen(id: string | null): void {
  useEffect(() => {
    if (!id) return
    onScreen.set(id, (onScreen.get(id) ?? 0) + 1)
    return () => {
      const n = (onScreen.get(id) ?? 1) - 1
      if (n <= 0) onScreen.delete(id)
      else onScreen.set(id, n)
    }
  }, [id])
}

// said once per transfer and step, even if the watcher remounts on a route change
const announced = new Set<string>()

export function announceOnce(id: string, step: string, say: () => void): void {
  const key = `${id}:${step}`
  if (announced.has(key)) return
  announced.add(key)
  if (!onScreen.has(id)) say()
}
