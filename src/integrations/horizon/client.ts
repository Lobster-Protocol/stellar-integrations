import { Horizon } from '@stellar/stellar-sdk'
import { STELLAR_RPC_FALLBACK, type Network } from '../../config/contracts'

const servers = new Map<Network, Horizon.Server>()

const READ_TIMEOUT_MS = 20_000

export function getHorizonServer(network: Network): Horizon.Server {
  const cached = servers.get(network)
  if (cached) return cached
  const env = import.meta.env
  const override = network === 'mainnet' ? env.VITE_HORIZON_MAINNET : env.VITE_HORIZON_TESTNET
  const url = override || STELLAR_RPC_FALLBACK[network].horizon
  const server = new Horizon.Server(url)
  // a read that hangs ends on an error instead of "Loading..." for good.
  // submitTransaction sends its own 60 s per request, which wins over this
  // default, so a send is never cut shorter than before
  server.httpClient.defaults.timeout = READ_TIMEOUT_MS
  servers.set(network, server)
  return server
}
