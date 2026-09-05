import crypto from 'node:crypto'

import { DfnsApiClient } from '@dfns/sdk'
import { AsymmetricKeySigner } from '@dfns/sdk-keysigner'

import type { Tenant } from './types'

// bound the resident key material: each cached client holds a PEM signer in
// memory, so cap how many orgs we keep and drop the oldest past the cap. an idle
// client is dropped after the ttl so a rotated-away tenant's key does not sit
// resident. small numbers on purpose, this is a signer cache not a throughput one.
const MAX_CLIENTS = 32
const IDLE_TTL_MS = 15 * 60_000

interface Entry {
  client: DfnsApiClient
  touched: number
}
const cache = new Map<string, Entry>()

// the cache key binds the tenant id to a hash of its live credentials, so
// rotating a tenant's key or token builds a fresh client instead of serving the
// stale signer. the digest never leaves the process and is never logged.
function credsVersion(t: Tenant): string {
  return crypto
    .createHash('sha256')
    .update([t.dfns.baseUrl, t.dfns.authToken, t.dfns.credId, t.dfns.privateKey, t.dfns.orgId ?? ''].join('\0'))
    .digest('hex')
}

function evictExpired(now: number): void {
  for (const [k, e] of cache) {
    if (now - e.touched >= IDLE_TTL_MS) cache.delete(k)
  }
}

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

// replaces the getDfnsClient() singleton. one dfns client per (tenant,
// creds-version); orgId is set on the client when the tenant carries one so the
// sdk refuses a request aimed at another org, closing the "one signer signs for
// the wrong org" breach a shared singleton would leave open.
export function dfnsClientFor(tenant: Tenant): DfnsApiClient {
  const now = Date.now()
  evictExpired(now)
  const key = `${tenant.id}:${credsVersion(tenant)}`
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

// offboarding + test seam: drop a tenant's cached signer so a rotated or disabled
// tenant stops being served from memory without waiting for the idle ttl or a
// process restart.
export function dropDfnsClient(tenantId: string): void {
  for (const k of cache.keys()) {
    if (k.startsWith(`${tenantId}:`)) cache.delete(k)
  }
}
