// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { Keypair } from '@stellar/stellar-sdk'

import { horizonServer, rpcServer } from '../stellar-client'

// an endpoint that takes the request and never answers
let silent: http.Server
let url: string

beforeAll(async () => {
  silent = http.createServer(() => {}).listen(0, '127.0.0.1')
  await new Promise((resolve) => silent.once('listening', resolve))
  url = `http://127.0.0.1:${(silent.address() as AddressInfo).port}`
})

afterAll(() => {
  silent.closeAllConnections()
  silent.close()
})

describe('stellar clients', () => {
  it('gives up on an rpc that never answers', async () => {
    const started = Date.now()
    await expect(rpcServer(url, 200).getLatestLedger()).rejects.toThrow()
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  it('gives up on a horizon that never answers', async () => {
    const started = Date.now()
    await expect(horizonServer(url, 200).loadAccount(Keypair.random().publicKey())).rejects.toThrow()
    expect(Date.now() - started).toBeLessThan(2_000)
  })
})
