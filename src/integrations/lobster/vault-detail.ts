import { useQuery } from '@tanstack/react-query'

import { CONTRACTS, type Network } from '../../config/contracts'
import { simulateRead } from '../stellar/read'
import type { VaultPosition } from './position'

// only read once the detail opens. null means the vault would not say
export interface VaultDetail {
  router: string | null
  shareToken: string | null
  multisig: string | null
}

async function readOrNull<T>(
  network: Network,
  source: string,
  contract: string,
  method: string,
): Promise<T | null> {
  try {
    return await simulateRead<T>(network, source, contract, method)
  } catch {
    // an idle vault has no router or share token to name, and says so by
    // failing the call rather than returning an empty address
    return null
  }
}

export async function getVaultDetail(
  network: Network,
  source: string,
  vault: VaultPosition,
): Promise<VaultDetail> {
  const read = <T>(method: string) => readOrNull<T>(network, source, vault.address, method)
  const deployed = vault.venue !== 'idle'

  const [router, shareToken, multisig] = await Promise.all([
    deployed ? read<string>('get_actual_router') : Promise.resolve(null),
    deployed ? read<string>('get_actual_share') : Promise.resolve(null),
    read<string>('get_multisig'),
  ])

  return { router, shareToken, multisig }
}

export function useVaultDetail(
  network: Network,
  account: string | null,
  vault: VaultPosition,
  enabled: boolean,
) {
  const source = account || CONTRACTS[network].lobster.readSource
  return useQuery({
    queryKey: ['lobster', 'vault-detail', network, vault.address, vault.venue],
    queryFn: () => getVaultDetail(network, source, vault),
    enabled: enabled && !!source,
    staleTime: 60_000,
    retry: 1,
  })
}
