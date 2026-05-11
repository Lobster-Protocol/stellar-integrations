import { Horizon } from '@stellar/stellar-sdk'
import type { Network } from '../lobster/types'

const DEFAULTS: Record<Network, string> = {
  testnet: 'https://horizon-testnet.stellar.org',
  mainnet: 'https://horizon.stellar.org',
}

const servers = new Map<Network, Horizon.Server>()

export function getHorizonServer(network: Network): Horizon.Server {
  const cached = servers.get(network)
  if (cached) return cached
  const env = import.meta.env
  const url =
    network === 'mainnet'
      ? env.VITE_HORIZON_MAINNET || DEFAULTS.mainnet
      : env.VITE_HORIZON_TESTNET || DEFAULTS.testnet
  const server = new Horizon.Server(url)
  servers.set(network, server)
  return server
}

// test-only
export function _resetHorizonCacheForTests(): void {
  servers.clear()
}
