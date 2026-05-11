import { Link } from 'react-router-dom'
import lobsterIcon from '../assets/lobster-icon.png'

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center">
      <img src={lobsterIcon} alt="" className="w-16 h-16 opacity-60" />
      <h2 className="text-2xl font-semibold text-text">404</h2>
      <p className="text-sm text-text-secondary max-w-md">
        Nothing here. Try one of the pages from the menu.
      </p>
      <div className="flex items-center gap-3 mt-2">
        <Link
          to="/"
          className="px-4 py-2 rounded-full bg-primary text-white text-sm font-semibold hover:bg-primary-dark"
        >
          Go to Overview
        </Link>
        <Link
          to="/positions"
          className="px-4 py-2 rounded-full bg-bg text-text text-sm font-semibold hover:bg-bg-card"
          style={{ border: '1px solid rgba(13, 45, 76, 0.08)' }}
        >
          Go to Positions
        </Link>
      </div>
    </div>
  )
}
