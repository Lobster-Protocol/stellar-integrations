import type { RefObject } from 'react'
import { Eye, Menu } from 'lucide-react'
import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { cn, shortenAddress, stellarExplorer } from '../utils/format'
import WalletChip from './WalletChip'
import ConnectMpcControl from './ConnectMpcControl'
import lobsterIcon from '../assets/lobster-icon.png'

interface Props {
  onMenuToggle?: () => void
  menuButtonRef?: RefObject<HTMLButtonElement | null>
  menuOpen?: boolean
}

export default function TopBar({ onMenuToggle, menuButtonRef, menuOpen }: Props) {
  const { address, viewing, stopViewing, connecting, connect } = useWallet()
  const { network, setNetwork } = useNetwork()

  // z-30 keeps the bar under the mobile drawer and the connect popover, which both
  // have to cover it
  return (
    <div
      className="h-14 flex items-center justify-between px-4 sm:px-6 bg-bg-card/60 backdrop-blur-sm sticky top-0 z-30"
      style={{ borderBottom: '1px solid rgba(13, 45, 76, 0.06)' }}
    >
      <div className="flex items-center gap-3">
        <button
          ref={menuButtonRef}
          onClick={onMenuToggle}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav-drawer"
          className="lg:hidden p-1.5 rounded-lg hover:bg-bg text-text-secondary"
        >
          <Menu size={20} />
        </button>
        {/* on a phone the drawer carries the logo; here it would push the controls off a 375px screen */}
        <div className="hidden sm:flex lg:hidden items-center gap-1.5">
          <img src={lobsterIcon} alt="Lobster" className="h-6 w-6" />
          <span className="text-sm font-semibold text-text">Lobster</span>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <button
          onClick={() => setNetwork(network === 'testnet' ? 'mainnet' : 'testnet')}
          aria-label={`Network: ${network}. Switch to ${network === 'testnet' ? 'mainnet' : 'testnet'}`}
          className={cn(
            'sm:hidden px-2.5 py-1 rounded-full bg-bg text-xs font-medium',
            network === 'testnet' ? 'text-primary' : 'text-green'
          )}
        >
          {network === 'testnet' ? 'Testnet' : 'Mainnet'}
        </button>
        <div className="hidden sm:flex items-center bg-bg rounded-full p-0.5 text-xs">
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

        {viewing ? (
          <div
            role="status"
            className="flex items-center gap-1.5 rounded-full border border-text-muted/20 bg-bg px-2.5 py-1"
          >
            <Eye size={12} className="text-text-muted shrink-0" aria-hidden="true" />
            <span className="hidden sm:block text-[10px] text-text-muted leading-none">Read-only view</span>
            <a
              href={stellarExplorer(network, 'account', viewing)}
              target="_blank"
              rel="noopener noreferrer"
              title={viewing}
              className="text-xs text-text font-mono hover:text-primary hover:underline"
            >
              {shortenAddress(viewing, 4)}
            </a>
            <button
              type="button"
              onClick={stopViewing}
              aria-label="Leave the read-only view"
              className="text-[10px] font-semibold text-primary hover:underline"
            >
              Leave
            </button>
          </div>
        ) : address ? (
          <WalletChip address={address} network={network} />
        ) : (
          <button
            onClick={connect}
            disabled={connecting}
            className="px-3 sm:px-4 py-1.5 rounded-full bg-primary text-white text-xs font-semibold hover:bg-primary-dark transition-all disabled:opacity-50"
          >
            {connecting ? '...' : 'Connect Wallet'}
          </button>
        )}

        <ConnectMpcControl />
      </div>
    </div>
  )
}
