import { Asset } from '@stellar/stellar-sdk'

import { CONTRACTS, type Network } from '../../config/contracts'
import { networkPassphrase } from '../lobster/client'

const cache = new Map<Network, Map<string, string>>()

function derive(code: string, issuer: string, passphrase: string): string | null {
  try {
    return new Asset(code, issuer).contractId(passphrase)
  } catch {
    return null
  }
}

function buildMap(network: Network): Map<string, string> {
  const c = CONTRACTS[network]
  const passphrase = networkPassphrase(network)
  const m = new Map<string, string>()

  if (c.tokens.xlmSac) m.set(c.tokens.xlmSac, 'XLM')
  if (c.tokens.usdcSac) m.set(c.tokens.usdcSac, 'USDC')
  if (c.tokens.usdcIssuer) {
    const sac = derive('USDC', c.tokens.usdcIssuer, passphrase)
    if (sac) m.set(sac, 'USDC')
  }
  if (c.lobsAsset.issuer) {
    const sac = derive(c.lobsAsset.code, c.lobsAsset.issuer, passphrase)
    if (sac) m.set(sac, c.lobsAsset.code)
  }
  for (const t of c.extraSwapTokens) {
    if (t.asset.startsWith('C')) {
      m.set(t.asset, t.code)
    } else if (t.asset.includes('-')) {
      const [code, issuer] = t.asset.split('-')
      const sac = derive(code, issuer, passphrase)
      if (sac) m.set(sac, code)
    }
  }
  return m
}

export function tokenLabel(contractId: string, network: Network): string | null {
  let m = cache.get(network)
  if (!m) {
    m = buildMap(network)
    cache.set(network, m)
  }
  return m.get(contractId) ?? null
}

export function protocolLabel(contractId: string, network: Network): string | null {
  // several registry slots are empty per network, and '' would match ''
  if (!contractId) return null
  const c = CONTRACTS[network]
  if (contractId === c.soroswap.router || contractId === c.soroswap.factory) return 'Soroswap'
  if (contractId === c.aquarius.router) return 'Aquarius'
  if (contractId === c.allbridge.bridge || contractId === c.allbridge.usdcPool) return 'Allbridge'
  if (contractId === c.broker.router) return 'Stellar Broker'
  if (contractId === c.lobster.factory) return 'Lobster factory'
  return null
}
