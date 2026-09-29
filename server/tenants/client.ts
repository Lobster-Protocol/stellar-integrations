import crypto from 'node:crypto'

import { DfnsApiClient } from '@dfns/sdk'
import { AsymmetricKeySigner } from '@dfns/sdk-keysigner'

import type { Tenant } from './types'

// each cached client holds a PEM signer in memory: cap the count and drop idle
// ones so a rotated-away tenant's key does not stay resident.
const MAX_CLIENTS = 32
const IDLE_TTL_MS = 15 * 60_000

interface Entry {
  client: DfnsApiClient
  touched: number
}
const cache = new Map<string, Entry>()

function evictOldest(): void {
  let oldestKey: string | null = null
  let oldest = Infinity
  for (const [k, e] of cache) {
    if (e.touched < oldest) {
      oldest = e.touched
      oldestKey = k
    }
  }
  if (oldestKey) cache.delete(oldestKey)
}

export function dfnsClientFor(tenant: Tenant): DfnsApiClient {
  const now = Date.now()
  for (const [k, e] of cache) {
    if (now - e.touched >= IDLE_TTL_MS) cache.delete(k)
  }
  // keyed on a hash of the live credentials so a rotated key or token builds a
  // fresh client instead of serving the stale signer. the digest is never logged.
  const credsVersion = crypto
    .createHash('sha256')
    .update([tenant.dfns.baseUrl, tenant.dfns.authToken, tenant.dfns.credId, tenant.dfns.privateKey, tenant.dfns.orgId ?? ''].join('\0'))
    .digest('hex')
  const key = `${tenant.id}:${credsVersion}`
  const hit = cache.get(key)
  if (hit) {
    hit.touched = now
    return hit.client
  }
  const signer = new AsymmetricKeySigner({
    credId: tenant.dfns.credId,
    privateKey: tenant.dfns.privateKey,
  })
  const client = new DfnsApiClient({
    baseUrl: tenant.dfns.baseUrl,
    authToken: tenant.dfns.authToken,
    signer,
    ...(tenant.dfns.orgId ? { orgId: tenant.dfns.orgId } : {}),
  })
  if (cache.size >= MAX_CLIENTS) evictOldest()
  cache.set(key, { client, touched: now })
  return client
}

// lets a disabled tenant's signer leave memory before the idle ttl runs out.
export function dropDfnsClient(tenantId: string): void {
  for (const k of cache.keys()) {
    if (k.startsWith(`${tenantId}:`)) cache.delete(k)
  }
}
