import { rpc, Networks, NotFoundError } from '@stellar/stellar-sdk'
import type { Network } from './types'
import { STELLAR_RPC_FALLBACK } from '../../config/contracts'

const servers = new Map<string, rpc.Server>()

const READ_TIMEOUT_MS = 20_000
// public mainnet rpc: past ~80 requests in 10 s it blocks the ip for 10-15 s, and the
// 429 has no cors header so axios sees ERR_NETWORK. these waits outlast one block.
export const READ_RETRY_DELAYS_MS = [2_000, 5_000, 10_000]

// 'read' times out and retries refusals; 'submit' does neither, since a send that
// gives up early can hide a tx that still lands. rpc.Server ignores its timeout option.
export function getSorobanServer(network: Network, use: 'read' | 'submit' = 'submit'): rpc.Server {
  const key = `${network}:${use}`
  const cached = servers.get(key)
  if (cached) return cached
  const env = import.meta.env
  const override = network === 'mainnet' ? env.VITE_STELLAR_RPC_MAINNET : env.VITE_STELLAR_RPC_TESTNET
  const url = override || STELLAR_RPC_FALLBACK[network].soroban
  const server = new rpc.Server(url, { allowHttp: url.startsWith('http://') })
  if (use === 'read') {
    server.httpClient.defaults.timeout = READ_TIMEOUT_MS
    retryRefusedReads(server.httpClient)
  }
  servers.set(key, server)
  return server
}

type ReadClient = Pick<rpc.Server['httpClient'], 'interceptors' | 'post'>

// a timeout is not sent again here, react-query's own retry covers it
export function retryRefusedReads(client: ReadClient, delays = READ_RETRY_DELAYS_MS) {
  client.interceptors.response.use((res) => res, async (err) => {
    const config = err?.config
    const status: number | undefined = err?.response?.status
    const refused = status === undefined ? err?.code === 'ERR_NETWORK' : status === 429 || status >= 502
    const tries: number = config?.lobsterTries ?? 0
    if (!config || !refused || tries >= delays.length) throw err
    await new Promise((r) => setTimeout(r, delays[tries]))
    return client.post(config.url, config.data, { ...config, lobsterTries: tries + 1 })
  })
}

export function networkPassphrase(network: Network): string {
  return network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET
}

// an account isn't on-chain until it gets some XLM, so say that instead of "Account not found"
export async function loadFunded(server: rpc.Server, caller: string, network: Network) {
  try {
    return await server.getAccount(caller)
  } catch (err) {
    // soroban rpc throws a plain Error("Account not found: G..."), not NotFoundError
    const msg = err instanceof Error ? err.message : String(err)
    if (err instanceof NotFoundError || /account not found/i.test(msg)) {
      const where = network === 'testnet' ? ' (use friendbot on testnet)' : ''
      throw new Error(`This wallet is not funded on ${network} yet. Add some XLM${where} to cover the network fee, then try again.`)
    }
    throw err
  }
}
