import { Asset } from '@stellar/stellar-sdk'
import { CONTRACTS, type Network } from '../../config/contracts'
import { isContractId, isAccountId } from '../stellar/strkey-guards'
import { networkPassphrase } from '../lobster/client'
import { decimalToStroops } from '../stellar/amount'

// broker asset format: 'xlm' for native, 'CODE-ISSUER' for classic, C... for soroban tokens
export function brokerAssetToSac(asset: string, network: Network): string | null {
  const c = CONTRACTS[network]
  if (asset === 'xlm') return isContractId(c.tokens.xlmSac) ? c.tokens.xlmSac : null
  if (asset.startsWith('C')) return isContractId(asset) ? asset : null
  // a classic SAC id derives from code, issuer and passphrase, no table needed
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

// zero, negative, over-precise or missing input all give null, so callers need one check
export function toStroops(decimal: string | undefined): bigint | null {
  if (!decimal) return null
  try {
    const stroops = decimalToStroops(decimal)
    return stroops > 0n ? stroops : null
  } catch {
    return null
  }
}
