// A deploy replaces the files behind every page, and the host only keeps the new ones. A tab
// opened before still asks for an old file when it opens a page or a window it has not shown
// yet, and gets the site's HTML back instead. Loading the page again picks up the new version.
// Once a minute at most, so a build that really lacks a file shows its error instead of
// reloading for ever
const KEY = 'lob_new_build_reload'
const AT_MOST_EVERY_MS = 60_000

let state: 'reloading' | 'stale' | null = null
export const newBuildState = () => state

export function reloadForNewBuild(reload: () => void = () => window.location.reload(), now = Date.now()): boolean {
  // offline the file is not gone, and loading again would only bring the browser's own error
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

// Vite raises this when a file it loads on demand, or one it preloads with it, fails to load
export function watchForNewBuild() {
  window.addEventListener('vite:preloadError', () => {
    reloadForNewBuild()
  })
}
