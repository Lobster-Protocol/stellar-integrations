// The host only serves the latest build, so a tab opened before a deploy can ask for a chunk
// that is gone. Reload once, at most once a minute so a broken build cannot loop.
const KEY = 'lob_new_build_reload'
const AT_MOST_EVERY_MS = 60_000

let state: 'reloading' | 'stale' | null = null
export const newBuildState = () => state

export function reloadForNewBuild(reload: () => void = () => window.location.reload(), now = Date.now()): boolean {
  // offline the chunk isn't gone, a reload would only show the browser's error page
  if (!navigator.onLine) return false
  state = 'stale'
  try {
    const last = Number(sessionStorage.getItem(KEY))
    if (last && now - last < AT_MOST_EVERY_MS) return false
    sessionStorage.setItem(KEY, String(now))
  } catch {
    // without session storage nothing would stop a loop
    return false
  }
  state = 'reloading'
  reload()
  return true
}

// Vite fires this when a lazy chunk or one of its preloads fails to load
export function watchForNewBuild() {
  window.addEventListener('vite:preloadError', () => {
    reloadForNewBuild()
  })
}
