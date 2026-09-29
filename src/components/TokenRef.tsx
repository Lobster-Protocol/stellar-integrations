import { useNetwork } from '../contexts/NetworkContext'
import { useTokenSymbol } from '../integrations/stellar/token-meta'
import { stellarExplorer, shortenAddress } from '../utils/format'

export default function TokenRef({ id }: { id: string }) {
  const { network } = useNetwork()
  const symbol = useTokenSymbol(id)

  return (
    <a
      href={stellarExplorer(network, 'contract', id)}
      target="_blank"
      rel="noopener noreferrer"
      title={id}
      className={symbol ? 'text-text hover:underline' : 'font-mono text-primary hover:underline'}
    >
      {symbol ?? shortenAddress(id)}
    </a>
  )
}
