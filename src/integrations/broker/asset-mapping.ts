import { CONTRACTS, type Network } from '../../config/contracts'
import { isContractId } from '../stellar/strkey-guards'
import { decimalToStroops } from '../stellar/amount'

// broker asset format: 'xlm' for native, 'CODE-ISSUER' for classic, C... for
// soroban tokens. soroswap and our analytics need the SAC contract id, so we
// map per network. shared between broker/hooks.ts and routing/route.ts.
export function brokerAssetToSac(asset: string, network: Network): string | null {
  const c = CONTRACTS[network]
  if (asset === 'xlm') return isContractId(c.tokens.xlmSac) ? c.tokens.xlmSac : null
  if (asset.startsWith('C')) return isContractId(asset) ? asset : null
  if (asset.startsWith('USDC-')) return isContractId(c.tokens.usdcSac) ? c.tokens.usdcSac : null
  return null
}

// decimal -> stroops through the exact integer parse, not a float multiply that
// loses precision past 2^53. null on zero, negative, over-precise or missing
// input, where decimalToStroops throws, so call sites fold the same null path as
// their other guards.
export function toStroops(decimal: string | undefined): bigint | null {
  if (!decimal) return null
  try {
    const stroops = decimalToStroops(decimal)
    return stroops > 0n ? stroops : null
  } catch {
    return null
  }
}
