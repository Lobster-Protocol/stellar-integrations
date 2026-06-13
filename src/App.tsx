import { useState, useEffect, useId, useRef, Component, Suspense, lazy, type ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { X } from 'lucide-react'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import Footer from './components/Footer'

// route-level code split keeps the initial bundle to the chrome only
const Overview = lazy(() => import('./pages/Overview'))
const Performance = lazy(() => import('./pages/Performance'))
const Activity = lazy(() => import('./pages/Activity'))
const Audit = lazy(() => import('./pages/Audit'))
const Allocation = lazy(() => import('./pages/Allocation'))
const Bridges = lazy(() => import('./pages/Bridges'))
const Positions = lazy(() => import('./pages/Positions'))
const NotFound = lazy(() => import('./pages/NotFound'))

// basic error boundary so the app doesn't white-screen
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center min-h-screen">
          <div className="text-center p-8">
            <h2 className="text-lg font-semibold text-text mb-2">Something went wrong</h2>
            <p className="text-sm text-text-secondary mb-4">{this.state.error.message}</p>
            <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-full bg-primary text-white text-sm">
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function RouteFallback() {
  return (
    <div className="flex items-center justify-center py-20 text-sm text-text-muted">
      Loading...
    </div>
  )
}

export default function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const drawerTitleId = useId()
  const drawerCloseBtnRef = useRef<HTMLButtonElement | null>(null)
  const menuButtonRef = useRef<HTMLButtonElement | null>(null)

  // Escape closes the drawer. Focus moves to the close button on open
  // and back to the menu trigger on close.
  useEffect(() => {
    if (!mobileMenuOpen) {
      menuButtonRef.current?.focus()
      return
    }
    drawerCloseBtnRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileMenuOpen])

  return (
    <ErrorBoundary>
      {/* skip-to-content link, only visible on focus */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-3 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-white focus:text-xs focus:font-semibold"
      >
        Skip to main content
      </a>

      <div className="flex min-h-screen flex-col">
        <div className="flex flex-1 min-h-0">
          {/* desktop sidebar */}
          <aside className="w-56 shrink-0 hidden lg:flex flex-col bg-bg-card h-screen sticky top-0" style={{ borderRight: '1px solid rgba(13, 45, 76, 0.08)' }}>
            <Sidebar />
          </aside>

          {/* mobile drawer overlay */}
          {mobileMenuOpen && (
            <div
              id="mobile-nav-drawer"
              role="dialog"
              aria-modal="true"
              aria-labelledby={drawerTitleId}
              className="fixed inset-0 z-50 lg:hidden"
            >
              <div className="absolute inset-0 bg-black/30" onClick={() => setMobileMenuOpen(false)} />
              <div className="absolute left-0 top-0 bottom-0 w-64 bg-bg-card shadow-xl flex flex-col">
                <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid rgba(13, 45, 76, 0.08)' }}>
                  <span id={drawerTitleId} className="text-sm font-semibold text-text">Menu</span>
                  <button
                    ref={drawerCloseBtnRef}
                    onClick={() => setMobileMenuOpen(false)}
                    aria-label="Close menu"
                    className="p-1 text-text-muted hover:text-text"
                  >
                    <X size={18} />
                  </button>
                </div>
                <Sidebar onNavigate={() => setMobileMenuOpen(false)} />
              </div>
            </div>
          )}

          <div className="flex-1 flex flex-col min-w-0">
            <TopBar
              onMenuToggle={() => setMobileMenuOpen(prev => !prev)}
              menuButtonRef={menuButtonRef}
              menuOpen={mobileMenuOpen}
            />
            <main id="main-content" tabIndex={-1} className="flex-1 p-4 sm:p-6 overflow-y-auto">
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/" element={<Overview />} />
                  <Route path="/performance" element={<Performance />} />
                  <Route path="/activity" element={<Activity />} />
                  <Route path="/audit" element={<Audit />} />
                  <Route path="/allocation" element={<Allocation />} />
                  <Route path="/bridges" element={<Bridges />} />
                  <Route path="/positions" element={<Positions />} />
                  <Route path="/404" element={<NotFound />} />
                  <Route path="*" element={<Navigate to="/404" replace />} />
                </Routes>
              </Suspense>
            </main>
            <Footer />
          </div>
        </div>
      </div>
    </ErrorBoundary>
  )
}
