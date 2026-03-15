import { NavLink } from 'react-router-dom'
import { useWallet, WALLETS } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { shortenAddress, cn } from '../utils/format'
import lobsterLogo from '../assets/lobster-logo.png'

export default function Header() {
  const { address, walletName, connecting, connect, disconnect, showPicker, setShowPicker } = useWallet()
  const { network, setNetwork } = useNetwork()

  return (
    <header className="bg-bg-card/80 backdrop-blur-md sticky top-0 z-50" style={{ borderBottom: '1px solid rgba(13, 45, 76, 0.08)' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <NavLink to="/" className="flex items-center gap-2">
            <img src={lobsterLogo} alt="Lobster" className="h-8 w-auto" />
          </NavLink>
          {/* TODO: mobile hamburger menu */}
          <nav className="hidden md:flex items-center gap-1">
            {[
              { to: '/', label: 'Dashboard' },
              { to: '/portfolio', label: 'Portfolio' },
              { to: '/analytics', label: 'Analytics' },
            ].map(link => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.to === '/'}
                className={({ isActive }) => cn(
                  'px-3 py-1.5 rounded-full text-sm font-medium transition-colors',
                  isActive ? 'bg-primary-light text-primary-dark' : 'text-text-secondary hover:text-text'
                )}
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {/* network pill */}
          <div className="flex items-center bg-bg rounded-full p-0.5">
            <button
              onClick={() => setNetwork('testnet')}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-all',
                network === 'testnet' ? 'bg-bg-card text-primary shadow-sm' : 'text-text-muted hover:text-text-secondary'
              )}
            >
              Testnet
            </button>
            <button
              onClick={() => setNetwork('mainnet')}
              className={cn(
                'px-3 py-1 rounded-full text-xs font-medium transition-all',
                network === 'mainnet' ? 'bg-bg-card text-green shadow-sm' : 'text-text-muted hover:text-text-secondary'
              )}
            >
              Mainnet
            </button>
          </div>

          {/* wallet */}
          <div className="relative">
            {address ? (
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex flex-col items-end">
                  <span className="text-xs text-text-secondary">{walletName}</span>
                  <span className="text-sm text-text font-mono">{shortenAddress(address, 6)}</span>
                </div>
                <button
                  onClick={disconnect}
                  className="px-3 py-1.5 rounded-full text-xs bg-bg text-text-secondary hover:text-error transition-colors"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setShowPicker(!showPicker)}
                  disabled={connecting}
                  className="px-5 py-2 rounded-full bg-primary hover:bg-primary-dark text-white text-sm font-semibold transition-all hover:-translate-y-0.5 disabled:opacity-50"
                  style={{ boxShadow: '0 10px 25px rgba(54, 147, 251, 0.25)' }}
                >
                  {connecting ? 'Connecting...' : 'Connect Wallet'}
                </button>
                {showPicker && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-bg-card rounded-2xl overflow-hidden z-50" style={{ border: '1px solid rgba(13, 45, 76, 0.08)', boxShadow: '0 12px 35px rgba(8, 10, 12, 0.08)' }}>
                    <div className="p-3" style={{ borderBottom: '1px solid rgba(13, 45, 76, 0.08)' }}>
                      <p className="text-xs text-text-secondary font-medium">Select a wallet</p>
                    </div>
                    {WALLETS.map(w => (
                      <button
                        key={w.id}
                        onClick={() => connect(w.id)}
                        className="w-full text-left px-4 py-3 text-sm text-text-secondary hover:bg-bg hover:text-text transition-colors flex items-center gap-3"
                      >
                        <span className="w-2 h-2 rounded-full bg-primary/40" />
                        {w.name}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
