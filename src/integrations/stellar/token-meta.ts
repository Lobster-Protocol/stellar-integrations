import { useQuery } from '@tanstack/react-query'

import { CONTRACTS, type Network } from '../../config/contracts'
import { useNetwork } from '../../contexts/NetworkContext'
import { useWallet } from '../../contexts/WalletContext'
import { tokenLabel } from './token-registry'
import { isContractId } from './strkey-guards'
import { simulateRead } from './read'

// Every Stellar Asset Contract answers symbol(), so a token we have no config
// entry for can still name itself. That is what turns CAXJ...32XV into TLOB in
// the position rows. Anything that fails to answer keeps showing its short id
// rather than a guessed name.
export async function fetchTokenSymbol(
  network: Network,
  source: string,
  id: string,
): Promise<string | null> {
  if (!isContractId(id)) return null
  try {
    const sym = await simulateRead<string>(network, source, id, 'symbol')
    return typeof sym === 'string' && sym.length > 0 && sym.length <= 12 ? sym : null
  } catch {
    return null
  }
}

// account the read simulates from: the connected wallet, else the public
// deployer we keep for anonymous testnet reads. null means we cannot read.
function sourceFor(network: Network, wallet: string | null): string | null {
  return wallet || CONTRACTS[network].lobster.readSource || null
}

export function useTokenSymbol(id: string): string | null {
  const { network } = useNetwork()
  const { address } = useWallet()
  const fromConfig = tokenLabel(id, network)
  const source = sourceFor(network, address)

  const q = useQuery({
    queryKey: ['token-symbol', network, id],
    queryFn: () => fetchTokenSymbol(network, source!, id),
    // config wins, so only tokens we cannot name are worth a round trip
    enabled: !fromConfig && !!source && isContractId(id),
    staleTime: Infinity,
    retry: false,
  })

  return fromConfig ?? q.data ?? null
}
