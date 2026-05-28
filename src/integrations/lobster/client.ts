import { rpc, Networks } from '@stellar/stellar-sdk'
import type { Network } from './types'

const DEFAULTS: Record<Network, string> = {
  testnet: 'https://soroban-testnet.stellar.org',
  mainnet: 'https://mainnet.sorobanrpc.com',
}

const servers = new Map<Network, rpc.Server>()

export function getSorobanServer(network: Network): rpc.Server {
  const cached = servers.get(network)
  if (cached) return cached
  const env = import.meta.env
  const url =
    network === 'mainnet'
      ? env.VITE_STELLAR_RPC_MAINNET || DEFAULTS.mainnet
      : env.VITE_STELLAR_RPC_TESTNET || DEFAULTS.testnet
  const server = new rpc.Server(url, { allowHttp: url.startsWith('http://') })
  servers.set(network, server)
  return server
}

export function networkPassphrase(network: Network): string {
  return network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET
}
