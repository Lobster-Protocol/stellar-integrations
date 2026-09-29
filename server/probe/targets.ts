import {
  CONTRACTS, STELLAR_RPC_FALLBACK, FRONTEND_URL,
  IRIS_BASE, CCTP_SOURCE_CHAINS, STELLAR_CCTP_DOMAIN,
} from '../../src/config/contracts'
import type { Network } from '../../src/config/contracts'

// what the production stack depends on, grouped by service area so a dashboard
// row maps back to a subsystem. env overrides let a deploy point at its own urls.

export interface HttpTarget {
  name: string
  area: 'bridge' | 'frontend' | 'swap' | 'custody' | 'mainnet' | 'shared'
  url: string
  // rpc and horizon also say how old their latest ledger is. cctp has to hand
  // back a fee table, answering is not enough.
  probe: 'rpc' | 'horizon' | 'cctp' | 'http'
}

export interface AccountTarget {
  role: string
  network: 'testnet' | 'mainnet'
  address: string
}

const env = process.env

// the fee quote the bridge asks Circle for before a burn, from the first source
// chain it offers. Circle's status page can read green while this call fails
// for us, so it is asked directly.
function cctpFeeUrl(network: Network): string {
  return `${IRIS_BASE[network]}/v2/burn/USDC/fees/${CCTP_SOURCE_CHAINS[network][0].domain}/${STELLAR_CCTP_DOMAIN}`
}

export function httpTargets(): HttpTarget[] {
  const t = STELLAR_RPC_FALLBACK.testnet
  const m = STELLAR_RPC_FALLBACK.mainnet
  const list: HttpTarget[] = [
    { name: 'frontend', area: 'frontend', url: env.MONITOR_FRONTEND_URL || FRONTEND_URL, probe: 'http' },
    { name: 'soroban-rpc-testnet', area: 'shared', url: t.soroban, probe: 'rpc' },
    { name: 'soroban-rpc-mainnet', area: 'mainnet', url: m.soroban, probe: 'rpc' },
    { name: 'horizon-testnet', area: 'shared', url: t.horizon, probe: 'horizon' },
    { name: 'horizon-mainnet', area: 'mainnet', url: m.horizon, probe: 'horizon' },
    { name: 'stellar-broker', area: 'swap', url: CONTRACTS.mainnet.broker.endpoint, probe: 'http' },
    { name: 'circle-cctp-testnet', area: 'bridge', url: cctpFeeUrl('testnet'), probe: 'cctp' },
    { name: 'circle-cctp-mainnet', area: 'bridge', url: cctpFeeUrl('mainnet'), probe: 'cctp' },
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
  // the treasury the sign guard enforces, unless MONITOR_TREASURY_ADDRESS names
  // another: a relay that signs on testnet still has to watch the funded mainnet
  // treasury, which is what the fee reserve board and alert read
  const treasury = env.MONITOR_TREASURY_ADDRESS || env.DFNS_TREASURY_ADDRESS
  if (treasury) {
    list.push({
      role: 'dfns-treasury',
      network: 'mainnet',
      address: treasury,
    })
  }
  if (env.MONITOR_TESTNET_WALLET) {
    list.push({ role: 'dfns-wallet', network: 'testnet', address: env.MONITOR_TESTNET_WALLET })
  }
  return list
}

export type Vendor = 'circle' | 'dfns' | 'stellar'

export interface VendorComponent {
  vendor: Vendor
  // the label boards and alerts key on
  component: string
  // the name on the vendor's status page, plus its group where the page reuses
  // a name across groups
  name: string
  group?: string
}

// status pages of what the stack leans on, all Statuspage json. Soroswap and
// Stellar Broker publish none, so the probes above are all there is for them.
export const VENDOR_STATUS_PAGES: Record<Vendor, string> = {
  circle: 'https://status.circle.com',
  dfns: 'https://status.dfns.co',
  stellar: 'https://status.stellar.org',
}

const CCTP_GROUP = 'Circle Cross-Chain Transfer Protocol'

export const VENDOR_COMPONENTS: VendorComponent[] = [
  { vendor: 'circle', component: 'cctp-stellar', name: 'XLM - Cross-Chain Minting and Burning', group: CCTP_GROUP },
  { vendor: 'circle', component: 'cctp-attestation', name: 'Attestation Service', group: CCTP_GROUP },
  { vendor: 'circle', component: 'cctp-sandbox', name: 'Circle CCTP - Sandbox', group: CCTP_GROUP },
  { vendor: 'dfns', component: 'api', name: 'REST API' },
  { vendor: 'dfns', component: 'signing', name: 'Signing Engine' },
  { vendor: 'dfns', component: 'stellar', name: 'Stellar' },
  { vendor: 'stellar', component: 'mainnet', name: 'Stellar Public Network' },
  { vendor: 'stellar', component: 'horizon-mainnet', name: 'SDF Public Network Horizon' },
  { vendor: 'stellar', component: 'testnet', name: 'Stellar Test Network' },
  { vendor: 'stellar', component: 'horizon-testnet', name: 'SDF Test Network Horizon' },
  { vendor: 'stellar', component: 'friendbot', name: 'Stellar Test Network Friendbot' },
]
