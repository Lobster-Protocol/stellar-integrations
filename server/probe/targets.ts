import { CONTRACTS, STELLAR_RPC_FALLBACK } from '../../src/config/contracts'

// what the production stack depends on, grouped by deliverable so a dashboard
// row maps back to a tranche. env overrides let a deploy point at its own urls.

export interface HttpTarget {
  name: string
  deliverable: 'D1' | 'D2' | 'D3' | 'D4' | 'D5' | 'shared'
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
    { name: 'frontend', deliverable: 'D2', url: env.MONITOR_FRONTEND_URL || 'https://stellar-instit.lobster-protocol.com', probe: 'http' },
    { name: 'soroban-rpc-testnet', deliverable: 'shared', url: t.soroban, probe: 'rpc' },
    { name: 'soroban-rpc-mainnet', deliverable: 'D5', url: m.soroban, probe: 'rpc' },
    { name: 'horizon-testnet', deliverable: 'shared', url: t.horizon, probe: 'http' },
    { name: 'horizon-mainnet', deliverable: 'D5', url: m.horizon, probe: 'http' },
    { name: 'stellar-broker', deliverable: 'D3', url: CONTRACTS.mainnet.broker.endpoint, probe: 'http' },
  ]
  if (env.DFNS_API_URL) {
    list.push({ name: 'dfns-api', deliverable: 'D4', url: env.DFNS_API_URL, probe: 'http' })
  }
  // the bff is localhost in dev; only probe a real deployed relay
  const bff = env.VITE_LOBSTER_API_URL || env.MONITOR_BFF_URL
  if (bff && !bff.includes('localhost')) {
    list.push({ name: 'bff-relay', deliverable: 'D4', url: bff, probe: 'http' })
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
