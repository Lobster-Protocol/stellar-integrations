import { CONTRACTS, type Network } from '../../config/contracts'
import { isContractId } from '../stellar/strkey-guards'

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

// decimal -> stroops with 7-digit fixed point. null on zero, negative, NaN or
// missing input so call sites can fold the same null path as their other
// guards.
export function toStroops(decimal: string | undefined): bigint | null {
  if (!decimal) return null
  const n = Number(decimal)
  if (!Number.isFinite(n) || n <= 0) return null
  return BigInt(Math.floor(n * 10_000_000))
}
