import { Horizon, rpc } from '@stellar/stellar-sdk'

// rpc.Server ignores its timeout option (sdk 14.6.1 only passes headers to the
// http client) and Horizon.Server has none, so set it on the client
export const STELLAR_TIMEOUT_MS = 15_000

export function rpcServer(url: string, timeoutMs = STELLAR_TIMEOUT_MS): rpc.Server {
  const server = new rpc.Server(url, { allowHttp: url.startsWith('http://') })
  server.httpClient.defaults.timeout = timeoutMs
  return server
}

export function horizonServer(url: string, timeoutMs = STELLAR_TIMEOUT_MS): Horizon.Server {
  const server = new Horizon.Server(url, { allowHttp: url.startsWith('http://') })
  server.httpClient.defaults.timeout = timeoutMs
  return server
}
