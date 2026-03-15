import { Routes, Route } from 'react-router-dom'
import Header from './components/Header'
import Dashboard from './pages/Dashboard'
import Portfolio from './pages/Portfolio'
import Analytics from './pages/Analytics'
import lobsterIcon from './assets/lobster-icon.png'

export default function App() {
  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/portfolio" element={<Portfolio />} />
          <Route path="/analytics" element={<Analytics />} />
        </Routes>
      </main>
      <footer className="py-6 mt-12" style={{ borderTop: '1px solid rgba(13, 45, 76, 0.08)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-text-muted text-sm">
            <img src={lobsterIcon} alt="" className="h-5 w-5 opacity-60" />
            <span>Lobster Protocol</span>
          </div>
          <div className="flex items-center gap-4 text-xs text-text-muted">
            <a href="https://github.com/Lobster-Protocol" target="_blank" rel="noopener noreferrer" className="hover:text-text-secondary transition-colors">
              GitHub
            </a>
            <a href="https://x.com/LobsterProtocol" target="_blank" rel="noopener noreferrer" className="hover:text-text-secondary transition-colors">
              X
            </a>
            <a href="https://discord.gg/4zE6nyBCYA" target="_blank" rel="noopener noreferrer" className="hover:text-text-secondary transition-colors">
              Discord
            </a>
            <span>Powered by Stellar</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
