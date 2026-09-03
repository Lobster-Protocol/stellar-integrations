import { rpc, Networks, NotFoundError } from '@stellar/stellar-sdk'
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

// getAccount 404s for a wallet that holds no funds yet: a brand-new account is
// not created on-chain until it receives some XLM. Without this it reaches the
// trader as a raw "Account not found" before signing, so turn just that case
// into a plain instruction they can act on.
export async function loadFunded(server: rpc.Server, caller: string, network: Network) {
  try {
    return await server.getAccount(caller)
  } catch (err) {
    // the soroban rpc throws a plain Error("Account not found: G...") here, not
    // Horizon's NotFoundError, so match the message too rather than the class.
    const msg = err instanceof Error ? err.message : String(err)
    if (err instanceof NotFoundError || /account not found/i.test(msg)) {
      throw new Error(
        `This wallet is not funded on ${network} yet. Add some XLM (use friendbot on testnet) to cover the network fee, then try again.`,
      )
    }
    throw err
  }
}
