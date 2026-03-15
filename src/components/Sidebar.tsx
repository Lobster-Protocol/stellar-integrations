import { NavLink } from 'react-router-dom'
import { cn } from '../utils/format'
import lobsterLogo from '../assets/lobster-logo.png'

const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: '◻' },
  { to: '/performance', label: 'Performance', icon: '◈' },
  { to: '/activity', label: 'Activity', icon: '◇' },
  { to: '/allocation', label: 'Allocation', icon: '◆' },
  { to: '/bridges', label: 'Bridges', icon: '◁' },
]

export default function Sidebar() {
  return (
    <aside className="w-56 shrink-0 hidden lg:flex flex-col bg-bg-card h-screen sticky top-0" style={{ borderRight: '1px solid rgba(13, 45, 76, 0.08)' }}>
      <div className="p-5 pb-8">
        <img src={lobsterLogo} alt="Lobster" className="h-8 w-auto" />
      </div>

      <nav className="flex-1 px-3 space-y-0.5">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-text-secondary hover:bg-bg hover:text-text'
            )}
          >
            <span className="text-base opacity-70">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 mx-3 mb-4 rounded-2xl" style={{ background: 'linear-gradient(135deg, rgba(54, 147, 251, 0.12), rgba(255, 135, 112, 0.08))' }}>
        <p className="text-xs text-text-secondary font-medium mb-1">Need help?</p>
        <a href="https://lobster-protocol.gitbook.io/lobster-documentation/" target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
          Read the docs →
        </a>
      </div>
    </aside>
  )
}
