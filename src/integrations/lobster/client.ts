import { rpc, Networks } from '@stellar/stellar-sdk'
import type { Network } from './types'
import { STELLAR_RPC_FALLBACK } from '../../config/contracts'

const servers = new Map<Network, rpc.Server>()

export function getSorobanServer(network: Network): rpc.Server {
  const cached = servers.get(network)
  if (cached) return cached
  const env = import.meta.env
  const override = network === 'mainnet' ? env.VITE_STELLAR_RPC_MAINNET : env.VITE_STELLAR_RPC_TESTNET
  const url = override || STELLAR_RPC_FALLBACK[network].soroban
  const server = new rpc.Server(url, { allowHttp: url.startsWith('http://') })
  servers.set(network, server)
  return server
}

export function networkPassphrase(network: Network): string {
  return network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET
}
