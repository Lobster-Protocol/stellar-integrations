import { Asset } from '@stellar/stellar-sdk'
import { CONTRACTS, type Network } from '../../config/contracts'
import { isContractId, isAccountId } from '../stellar/strkey-guards'
import { networkPassphrase } from '../lobster/client'
import { decimalToStroops } from '../stellar/amount'

// broker asset format: 'xlm' for native, 'CODE-ISSUER' for classic, C... for
// soroban tokens. soroswap and our analytics need the SAC contract id, so we
// map per network. shared between broker/hooks.ts and routing/route.ts.
export function brokerAssetToSac(asset: string, network: Network): string | null {
  const c = CONTRACTS[network]
  if (asset === 'xlm') return isContractId(c.tokens.xlmSac) ? c.tokens.xlmSac : null
  if (asset.startsWith('C')) return isContractId(asset) ? asset : null
  // CODE-ISSUER classic asset. the SAC is deterministic from the code, issuer
  // and network passphrase, so derive it rather than keep a table of contract
  // ids. covers USDC and every mainnet swap token in one path.
  const dash = asset.indexOf('-')
  if (dash > 0) {
    const issuer = asset.slice(dash + 1)
    if (!isAccountId(issuer)) return null
    try {
      return new Asset(asset.slice(0, dash), issuer).contractId(networkPassphrase(network))
    } catch {
      return null
    }
  }
  return null
}

// null-returning wrapper over decimalToStroops: zero, negative, over-precise or
// missing input all fold to null so call sites share one guard path.
export function toStroops(decimal: string | undefined): bigint | null {
  if (!decimal) return null
  try {
    const stroops = decimalToStroops(decimal)
    return stroops > 0n ? stroops : null
  } catch {
    return null
  }
}
