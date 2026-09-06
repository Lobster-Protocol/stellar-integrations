import type { RefObject } from 'react'
import { Menu } from 'lucide-react'
import { useWallet } from '../contexts/WalletContext'
import { useNetwork } from '../contexts/NetworkContext'
import { cn } from '../utils/format'
import WalletChip from './WalletChip'
import ConnectMpcControl from './ConnectMpcControl'
import PairMultisigControl from './PairMultisigControl'
import lobsterIcon from '../assets/lobster-icon.png'

interface Props {
  onMenuToggle?: () => void
  menuButtonRef?: RefObject<HTMLButtonElement | null>
  menuOpen?: boolean
}

export default function TopBar({ onMenuToggle, menuButtonRef, menuOpen }: Props) {
  const { address, connecting, connect } = useWallet()
  const { network, setNetwork } = useNetwork()

  return (
    <div className="h-14 flex items-center justify-between px-4 sm:px-6 bg-bg-card/60 backdrop-blur-sm" style={{ borderBottom: '1px solid rgba(13, 45, 76, 0.06)' }}>
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
        <div className="lg:hidden flex items-center gap-1.5">
          <img src={lobsterIcon} alt="Lobster" className="h-6 w-6" />
          <span className="text-sm font-semibold text-text">Lobster</span>
        </div>
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

        {/* One connected-wallet chip (address actions + disconnect live in its menu),
            plus the optional multisig-pairing label. When nothing is connected, the
            plain Connect Wallet button. */}
        {address ? (
          <div className="flex items-center gap-1.5">
            <WalletChip address={address} network={network} />
            <PairMultisigControl key={`${network}:${address}`} address={address} network={network} />
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

        {/* DFNS custody: WalletConnect is the default, a relay is the advanced path.
            Hidden once a DFNS wallet is connected over WalletConnect - that already
            shows in the wallet chip, so a second "+ MPC" invite would only confuse. */}
        <ConnectMpcControl />
      </div>
    </div>
  )
}
