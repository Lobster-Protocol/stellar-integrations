import { describe, it, expect, vi } from 'vitest'

import { retryRefusedReads } from '../client'

type Outcome = 'ok' | 'network' | 'timeout' | number

// fake axios: a failed send goes through the rejection handler with its config
function rpcClient(outcomes: Outcome[]) {
  let onError: (err: unknown) => unknown = (err) => {
    throw err
  }
  const send = (config: Record<string, unknown>): Promise<unknown> => {
    const o = outcomes.shift()
    if (o === 'ok') return Promise.resolve({ status: 200, config })
    const err =
      o === 'network'
        ? { code: 'ERR_NETWORK', config }
        : o === 'timeout'
          ? { code: 'ECONNABORTED', config }
          : { response: { status: o }, config }
    return Promise.reject(err).catch((e) => onError(e))
  }
  const post = vi.fn((url: string, data: unknown, config: Record<string, unknown>) => send({ ...config, url, data }))
  const client = {
    post,
    interceptors: {
      response: {
        use: (_ok: unknown, bad: typeof onError) => {
          onError = bad
          return 0
        },
      },
    },
  }
  retryRefusedReads(client as unknown as Parameters<typeof retryRefusedReads>[0], [0, 0, 0])
  return { post, read: () => send({ url: 'https://rpc.example', data: '{}' }) }
}

describe('retryRefusedReads', () => {
  it('sends a read again after a network error', async () => {
    const { post, read } = rpcClient(['network', 'ok'])
    await expect(read()).resolves.toMatchObject({ status: 200 })
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('retries through 429, 503 and a network error', async () => {
    const { post, read } = rpcClient([429, 503, 'network', 'ok'])
    await expect(read()).resolves.toMatchObject({ status: 200 })
    expect(post).toHaveBeenCalledTimes(3)
  })

  it('gives up once the waits run out', async () => {
    const { post, read } = rpcClient([429, 429, 429, 429])
    await expect(read()).rejects.toMatchObject({ response: { status: 429 } })
    expect(post).toHaveBeenCalledTimes(3)
  })

  it('leaves a timeout to the query retry', async () => {
    const { post, read } = rpcClient(['timeout'])
    await expect(read()).rejects.toMatchObject({ code: 'ECONNABORTED' })
    expect(post).not.toHaveBeenCalled()
  })

  it('does not resend a request the rpc turned down', async () => {
    const { post, read } = rpcClient([400])
    await expect(read()).rejects.toMatchObject({ response: { status: 400 } })
    expect(post).not.toHaveBeenCalled()
  })
})
