import { Horizon } from '@stellar/stellar-sdk'
import type { Network } from '../lobster/types'
import { STELLAR_RPC_FALLBACK } from '../../config/contracts'

const servers = new Map<Network, Horizon.Server>()

export function getHorizonServer(network: Network): Horizon.Server {
  const cached = servers.get(network)
  if (cached) return cached
  const env = import.meta.env
  const override = network === 'mainnet' ? env.VITE_HORIZON_MAINNET : env.VITE_HORIZON_TESTNET
  const url = override || STELLAR_RPC_FALLBACK[network].horizon
  const server = new Horizon.Server(url)
  servers.set(network, server)
  return server
}
