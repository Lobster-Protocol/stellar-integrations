import { NavLink } from 'react-router-dom'
import { LayoutDashboard, TrendingUp, Activity, PieChart, ArrowLeftRight } from 'lucide-react'
import { cn } from '../utils/format'
import lobsterLogo from '../assets/lobster-logo.png'

const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: LayoutDashboard },
  { to: '/performance', label: 'Performance', icon: TrendingUp },
  { to: '/activity', label: 'Activity', icon: Activity },
  { to: '/allocation', label: 'Allocation', icon: PieChart },
  { to: '/bridges', label: 'Bridges', icon: ArrowLeftRight },
]

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-5 pb-8 hidden lg:block">
        <img src={lobsterLogo} alt="Lobster" className="h-8 w-auto" />
      </div>

      <nav className="flex-1 px-3 space-y-0.5">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) => cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary/10 text-primary'
                : 'text-text-secondary hover:bg-bg hover:text-text'
            )}
          >
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 mx-3 mb-4 rounded-2xl hidden lg:block" style={{ background: 'linear-gradient(135deg, rgba(54, 147, 251, 0.12), rgba(255, 135, 112, 0.08))' }}>
        <p className="text-xs text-text-secondary font-medium mb-1">Powered by Stellar</p>
        <p className="text-[10px] text-text-muted">Soroswap · Aquarius · Phoenix</p>
      </div>
    </div>
  )
}
