import { useState, Component, type ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { X } from 'lucide-react'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import Overview from './pages/Overview'
import Performance from './pages/Performance'
import Activity from './pages/Activity'
import Allocation from './pages/Allocation'
import Bridges from './pages/Bridges'

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

export default function App() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <ErrorBoundary>
      <div className="flex min-h-screen">
        {/* desktop sidebar */}
        <aside className="w-56 shrink-0 hidden lg:flex flex-col bg-bg-card h-screen sticky top-0" style={{ borderRight: '1px solid rgba(13, 45, 76, 0.08)' }}>
          <Sidebar />
        </aside>

        {/* mobile drawer overlay */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div className="absolute inset-0 bg-black/30" onClick={() => setMobileMenuOpen(false)} />
            <div className="absolute left-0 top-0 bottom-0 w-64 bg-bg-card shadow-xl flex flex-col">
              <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid rgba(13, 45, 76, 0.08)' }}>
                <span className="text-sm font-semibold text-text">Menu</span>
                <button onClick={() => setMobileMenuOpen(false)} className="p-1 text-text-muted hover:text-text">
                  <X size={18} />
                </button>
              </div>
              <Sidebar onNavigate={() => setMobileMenuOpen(false)} />
            </div>
          </div>
        )}

        <div className="flex-1 flex flex-col min-w-0">
          <TopBar onMenuToggle={() => setMobileMenuOpen(prev => !prev)} />
          <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/performance" element={<Performance />} />
              <Route path="/activity" element={<Activity />} />
              <Route path="/allocation" element={<Allocation />} />
              <Route path="/bridges" element={<Bridges />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>
    </ErrorBoundary>
  )
}
