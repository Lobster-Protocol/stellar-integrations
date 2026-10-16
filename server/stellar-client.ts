import { Horizon, rpc } from '@stellar/stellar-sdk'

// rpc.Server accepts a timeout option and drops it (14.6.1 hands only the headers
// to its http client) and Horizon.Server sets no deadline at all, so a stuck
// endpoint holds the request open until the socket dies. the deadline goes on the
// http client itself.
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
