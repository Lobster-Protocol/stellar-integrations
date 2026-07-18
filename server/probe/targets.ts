import { CONTRACTS, STELLAR_RPC_FALLBACK } from '../../src/config/contracts'

// what the production stack depends on, grouped by service area so a dashboard
// row maps back to a subsystem. env overrides let a deploy point at its own urls.

export interface HttpTarget {
  name: string
  area: 'bridge' | 'frontend' | 'swap' | 'custody' | 'mainnet' | 'shared'
  url: string
  probe: 'rpc' | 'http'
}

export interface AccountTarget {
  role: string
  network: 'testnet' | 'mainnet'
  address: string
  usdcIssuer?: string
}

const env = process.env

export function httpTargets(): HttpTarget[] {
  const t = STELLAR_RPC_FALLBACK.testnet
  const m = STELLAR_RPC_FALLBACK.mainnet
  const list: HttpTarget[] = [
    { name: 'frontend', area: 'frontend', url: env.MONITOR_FRONTEND_URL || 'https://stellar-instit.lobster-protocol.com', probe: 'http' },
    { name: 'soroban-rpc-testnet', area: 'shared', url: t.soroban, probe: 'rpc' },
    { name: 'soroban-rpc-mainnet', area: 'mainnet', url: m.soroban, probe: 'rpc' },
    { name: 'horizon-testnet', area: 'shared', url: t.horizon, probe: 'http' },
    { name: 'horizon-mainnet', area: 'mainnet', url: m.horizon, probe: 'http' },
    { name: 'stellar-broker', area: 'swap', url: CONTRACTS.mainnet.broker.endpoint, probe: 'http' },
  ]
  if (env.DFNS_API_URL) {
    list.push({ name: 'dfns-api', area: 'custody', url: env.DFNS_API_URL, probe: 'http' })
  }
  // the bff is localhost in dev; only probe a real deployed relay
  const bff = env.VITE_LOBSTER_API_URL || env.MONITOR_BFF_URL
  if (bff && !bff.includes('localhost')) {
    list.push({ name: 'bff-relay', area: 'custody', url: bff, probe: 'http' })
  }
  return list
}

export function accountTargets(): AccountTarget[] {
  const list: AccountTarget[] = []
  // same env var the sign guard reads, so the monitored treasury can't drift
  // from the one the guard enforces against
  if (env.DFNS_TREASURY_ADDRESS) {
    list.push({
      role: 'dfns-treasury',
      network: 'mainnet',
      address: env.DFNS_TREASURY_ADDRESS,
      usdcIssuer: CONTRACTS.mainnet.tokens.usdcIssuer,
    })
  }
  if (env.MONITOR_TESTNET_WALLET) {
    list.push({ role: 'dfns-wallet', network: 'testnet', address: env.MONITOR_TESTNET_WALLET })
  }
  return list
}
