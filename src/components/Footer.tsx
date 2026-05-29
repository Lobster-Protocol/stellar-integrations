import { useNetwork } from '../contexts/NetworkContext'
import { CONTRACTS } from '../config/contracts'
import { shortenAddress, stellarExplorer } from '../utils/format'

export default function Footer() {
  const { network } = useNetwork()
  const factoryId = CONTRACTS[network].lobster.factory
  const factoryExplorer = factoryId ? stellarExplorer(network, 'contract', factoryId) : null

  return (
    <footer
      className="px-4 sm:px-6 py-4 text-[11px] text-text-muted bg-bg-card/40 print:hidden"
      style={{ borderTop: '1px solid rgba(13, 45, 76, 0.06)' }}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <span>Lobster Protocol</span>
          <span className="text-text-muted/60">·</span>
          <span>
            <span className="text-text font-medium">{network}</span>
          </span>
          {factoryExplorer && (
            <>
              <span className="text-text-muted/60">·</span>
              <a
                href={factoryExplorer}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline font-mono"
              >
                Factory {shortenAddress(factoryId, 4)} ↗
              </a>
            </>
          )}
        </div>

        <div className="text-text-muted/80">MIT</div>
      </div>
    </footer>
  )
}
