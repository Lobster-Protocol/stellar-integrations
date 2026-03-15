import { Menu } from 'lucide-react'
import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { shortenAddress, cn } from '../utils/format'
import lobsterIcon from '../assets/lobster-icon.png'

interface Props {
  onMenuToggle?: () => void
}

export default function TopBar({ onMenuToggle }: Props) {
  const { address, walletName, connecting, connect, disconnect } = useWallet()
  const { network, setNetwork } = useNetwork()

  return (
    <div className="h-14 flex items-center justify-between px-4 sm:px-6 bg-bg-card/60 backdrop-blur-sm" style={{ borderBottom: '1px solid rgba(13, 45, 76, 0.06)' }}>
      <div className="flex items-center gap-3">
        {/* mobile menu btn */}
        <button onClick={onMenuToggle} className="lg:hidden p-1.5 rounded-lg hover:bg-bg text-text-secondary">
          <Menu size={20} />
        </button>
        {/* mobile logo */}
        <div className="lg:hidden flex items-center gap-1.5">
          <img src={lobsterIcon} alt="Lobster" className="h-6 w-6" />
          <span className="text-sm font-semibold text-text">Lobster</span>
        </div>
        <div className="hidden lg:block" />
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <div className="flex items-center bg-bg rounded-full p-0.5 text-xs">
          <button
            onClick={() => setNetwork('testnet')}
            className={cn(
              'px-2 sm:px-2.5 py-1 rounded-full font-medium transition-all',
              network === 'testnet' ? 'bg-bg-card text-primary shadow-sm' : 'text-text-muted'
            )}
          >
            Testnet
          </button>
          <button
            onClick={() => setNetwork('mainnet')}
            className={cn(
              'px-2 sm:px-2.5 py-1 rounded-full font-medium transition-all',
              network === 'mainnet' ? 'bg-bg-card text-green shadow-sm' : 'text-text-muted'
            )}
          >
            Mainnet
          </button>
        </div>

        {address ? (
          <div className="flex items-center gap-2">
            <div className="hidden sm:block text-right">
              <p className="text-[10px] text-text-muted leading-none">{walletName}</p>
              <p className="text-xs text-text font-mono">{shortenAddress(address, 5)}</p>
            </div>
            <button onClick={disconnect} className="text-xs text-text-muted hover:text-error px-2 py-1 rounded-full hover:bg-error/5 transition-colors">
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={connect}
            disabled={connecting}
            className="px-3 sm:px-4 py-1.5 rounded-full bg-primary text-white text-xs font-semibold hover:bg-primary-dark transition-all disabled:opacity-50"
          >
            {connecting ? '...' : 'Connect Wallet'}
          </button>
        )}
      </div>
    </div>
  )
}
