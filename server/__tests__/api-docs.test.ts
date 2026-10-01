// @vitest-environment node
import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest'

vi.hoisted(() => {
  process.env.DFNS_WEBHOOK_SECRET = 'test-secret-32chars-or-more-long'
  process.env.DASHBOARD_ORIGIN = 'http://localhost:5173'
})

const { statusMock, transferMock } = vi.hoisted(() => ({
  statusMock: vi.fn(),
  transferMock: vi.fn(),
}))

vi.mock('../dfns/sign', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../dfns/sign')>()),
  getSignatureStatus: statusMock,
  envelopeFromSignedData: (hex: string) => ({ toXDR: () => `XDR-from-${hex}` }),
}))
vi.mock('../dfns/transfer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../dfns/transfer')>()),
  transferNative: transferMock,
}))
// a chain only breaks on a bug upstream, so the test breaks it itself
vi.mock('../mica-export', async (importOriginal) => {
  const real = await importOriginal<typeof import('../mica-export')>()
  return { ...real, verifyChain: vi.fn(real.verifyChain) }
})

import crypto from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { Hono } from 'hono'

import { app } from '../webhook'
import { mountMetrics } from '../metrics/http'
import { verifyChain } from '../mica-export'

const SECRET = 'test-secret-32chars-or-more-long'
const API_TOKEN = 'test-api-token-32-chars-long-x'
const OPERATOR_TOKEN = 'test-operator-token-40-chars-long-value'
const TREASURY = 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU'
const BEARER = { authorization: `Bearer ${API_TOKEN}` }
const TRANSFER_ENV = {
  LOBSTER_API_TOKEN: API_TOKEN,
  DFNS_STELLAR_WALLET_ID: 'wa-1',
  DFNS_TREASURY_ADDRESS: TREASURY,
  DFNS_GUARD_PERMISSIVE: '1',
}
const SHARED = ['lobsterToken', 'bearerAuth', 'lobsterQueryToken']
const METHODS = ['get', 'post', 'put', 'patch', 'delete']

type Security = Array<Record<string, string[]>>

interface Operation {
  summary: string
  tags: string[]
  security?: Security
  responses: Record<string, { content?: Record<string, { schema?: { properties?: Record<string, unknown> } }> }>
}

interface Spec {
  security: Security
  paths: Record<string, Record<string, Operation>>
  components: { securitySchemes: Record<string, { type: string; in?: string }> }
}

interface PostmanRequest {
  name: string
  request: { method: string; url: { path: string[] } }
  response: Array<{ code: number }>
}

// js-yaml ships no types
const { load } = createRequire(import.meta.url)('js-yaml') as { load: (text: string) => unknown }

const spec = load(readFileSync(resolve(process.cwd(), 'lobster-docs/openapi/lobster.yaml'), 'utf8')) as Spec
const collection = JSON.parse(
  readFileSync(resolve(process.cwd(), 'lobster-docs/postman/lobster.postman_collection.json'), 'utf8'),
) as { item: Array<{ name: string; item: PostmanRequest[] }> }

function operations(): Array<{ key: string; op: Operation }> {
  return Object.entries(spec.paths).flatMap(([path, item]) =>
    Object.entries(item)
      .filter(([method]) => METHODS.includes(method))
      .map(([method, op]) => ({ key: `${method} ${path}`, op })),
  )
}

function operation(key: string): Operation {
  const [method, path] = key.split(' ')
  const op = spec.paths[path]?.[method]
  if (!op) throw new Error(`${key} is not in the spec`)
  return op
}

function documented(key: string): string[] {
  return Object.keys(operation(key).responses)
}

// scheme names per accepted alternative; the schemes inside one alternative are all required
function security(key: string): string[][] {
  return (operation(key).security ?? spec.security).map((alternative) => Object.keys(alternative))
}

function bodyKeys(key: string): string[] {
  return Object.keys(operation(key).responses['200']?.content?.['application/json']?.schema?.properties ?? {})
}

function routeKey(method: string, path: string): string {
  return `${method.toLowerCase()} ${path.replace(/:(\w+)/g, '{$1}')}`
}

function appRoutes() {
  return app.routes.filter((r) => r.method !== 'ALL')
}

// what server/index.ts serves: the webhook app plus /metrics
function relayRoutes(): string[] {
  const metrics = new Hono()
  mountMetrics(metrics)
  const routes = [...appRoutes(), ...metrics.routes]
  return [...new Set(routes.map((r) => routeKey(r.method, r.path)))]
}

interface Guards {
  rateLimit: boolean
  sharedToken: boolean
  queryToken: boolean
  operatorToken: boolean
}

// the webhook app with each route's last handler swapped for a stub, so a request
// runs the real guards and stops before DFNS, Circle or a ledger
function guardsOnly(): Hono {
  const stubbed = new Hono()
  const routes = appRoutes()
  routes.forEach((r, i) => {
    const last = !routes.slice(i + 1).some((later) => later.method === r.method && later.path === r.path)
    if (last) stubbed.on(r.method, r.path, () => new Response(null, { status: 204 }))
    else stubbed.on(r.method, r.path, r.handler)
  })
  return stubbed
}

let caller = 0

// a fresh address per request keeps one probe out of another's rate-limit window
function nextAddress(): string {
  return `198.51.100.${++caller}`
}

async function readGuards(): Promise<Map<string, Guards>> {
  const stubbed = guardsOnly()
  const tokens = { LOBSTER_API_TOKEN: API_TOKEN, LOBSTER_OPERATOR_TOKEN: OPERATOR_TOKEN }
  const operator = { 'x-lobster-operator-token': OPERATOR_TOKEN }
  const found = new Map<string, Guards>()
  for (const { method, path } of appRoutes()) {
    const key = routeKey(method, path)
    if (found.has(key)) continue
    const url = `http://localhost${path.replace(/:\w+/g, 'x')}`
    const send = async (env: Record<string, string>, headers: Record<string, string> = {}, query = '') => {
      Object.assign(process.env, env)
      try {
        const init = { method, headers: { 'x-forwarded-for': nextAddress(), ...headers } }
        return (await stubbed.fetch(new Request(`${url}${query}`, init))).status
      } finally {
        for (const name of Object.keys(env)) delete process.env[name]
      }
    }
    const sameCaller = { 'x-forwarded-for': nextAddress() }
    await send({ RATE_LIMIT_PER_MIN: '1' }, sameCaller)
    const sharedToken = (await send(tokens, operator)) === 401
    found.set(key, {
      rateLimit: (await send({ RATE_LIMIT_PER_MIN: '1' }, sameCaller)) === 429,
      operatorToken: (await send({})) === 503,
      sharedToken,
      queryToken: sharedToken && (await send(tokens, operator, `?token=${API_TOKEN}`)) === 204,
    })
  }
  return found
}

function get(path: string): Request {
  return new Request(`http://localhost${path}`)
}

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  })
}

function webhook(event: Record<string, unknown>, signature?: string): Request {
  const raw = JSON.stringify(event)
  const sig = signature ?? crypto.createHmac('sha256', SECRET).update(raw).digest('hex')
  return new Request('http://localhost/webhooks/dfns', {
    method: 'POST',
    body: raw,
    headers: { 'x-dfns-webhook-signature': sig },
  })
}

function event(id: string, ageSec = 0): Record<string, unknown> {
  return { id, kind: 'wallet.signature.signed', timestampSent: Math.floor(Date.now() / 1000) - ageSec }
}

interface Answer {
  name: string
  route: string
  status: number
  env?: Record<string, string>
  arrange?: () => unknown
  request: () => Request
}

// answers the relay gives without reaching DFNS, Circle or a ledger
const ANSWERS: Answer[] = [
  {
    name: 'a webhook with a bad signature',
    route: 'post /webhooks/dfns',
    status: 401,
    request: () => webhook(event('evt-bad-sig'), 'sha256=00'),
  },
  {
    name: 'a stale webhook event',
    route: 'post /webhooks/dfns',
    status: 401,
    request: () => webhook(event('evt-stale', 3600)),
  },
  {
    name: 'a webhook body that is not an event',
    route: 'post /webhooks/dfns',
    status: 400,
    request: () => webhook({ id: 'evt-odd' }),
  },
  {
    name: 'an audit export whose chain breaks',
    route: 'get /dfns/audit/export',
    status: 500,
    arrange: () => vi.mocked(verifyChain).mockReturnValueOnce(0),
    request: () => get('/dfns/audit/export'),
  },
  {
    name: 'a transfer with no api token set',
    route: 'post /dfns/transfer',
    status: 503,
    request: () => post('/dfns/transfer', { to: TREASURY, stroops: '1' }),
  },
  {
    name: 'a transfer with no amount',
    route: 'post /dfns/transfer',
    status: 400,
    env: TRANSFER_ENV,
    request: () => post('/dfns/transfer', { to: TREASURY }, BEARER),
  },
  {
    name: 'a transfer DFNS refuses',
    route: 'post /dfns/transfer',
    status: 502,
    env: TRANSFER_ENV,
    arrange: () => transferMock.mockRejectedValueOnce(new Error('dfns down')),
    request: () => post('/dfns/transfer', { to: TREASURY, stroops: '1' }, BEARER),
  },
  {
    name: 'a status poll with no wallet id',
    route: 'get /dfns/sign/{id}/status',
    status: 503,
    request: () => get('/dfns/sign/sig-1/status'),
  },
  {
    name: 'a wallet create, operator token unset',
    route: 'post /dfns/wallets',
    status: 503,
    env: { LOBSTER_API_TOKEN: API_TOKEN },
    request: () => post('/dfns/wallets', { name: 'desk', network: 'StellarTestnet' }, BEARER),
  },
  {
    name: 'a decision with a wrong operator token',
    route: 'post /dfns/approvals/{id}/decision',
    status: 401,
    env: { LOBSTER_API_TOKEN: API_TOKEN, LOBSTER_OPERATOR_TOKEN: OPERATOR_TOKEN },
    request: () =>
      post('/dfns/approvals/ap-1/decision', { value: 'Approved' }, { ...BEARER, 'x-lobster-operator-token': 'wrong' }),
  },
  {
    name: 'a delivery, operator token unset',
    route: 'post /cctp/deliver',
    status: 503,
    request: () => post('/cctp/deliver', {}),
  },
  {
    name: 'a caller over the rate limit',
    route: 'post /dfns/sign',
    status: 429,
    env: { RATE_LIMIT_PER_MIN: '1' },
    arrange: () => app.fetch(post('/dfns/sign', {}, { 'x-forwarded-for': '203.0.113.7' })),
    request: () => post('/dfns/sign', {}, { 'x-forwarded-for': '203.0.113.7' }),
  },
]

let relayGuards = new Map<string, Guards>()

beforeAll(async () => {
  relayGuards = await readGuards()
})

afterEach(() => {
  for (const name of ['LOBSTER_API_TOKEN', 'LOBSTER_OPERATOR_TOKEN', 'RATE_LIMIT_PER_MIN', ...Object.keys(TRANSFER_ENV)]) {
    delete process.env[name]
  }
})

describe('openapi spec', () => {
  it('documents every route the relay serves, and no other', () => {
    expect(operations().map(({ key }) => key).sort()).toEqual(relayRoutes().sort())
  })

  it('lists a 429 on the rate-limited routes only', () => {
    expect(relayGuards.size).toBeGreaterThan(0)
    for (const [key, { rateLimit }] of relayGuards) {
      expect(documented(key).includes('429'), key).toBe(rateLimit)
    }
  })

  it('asks for the tokens each route checks', () => {
    for (const [key, { sharedToken, operatorToken }] of relayGuards) {
      const alternatives = security(key)
      if (!sharedToken && !operatorToken) {
        expect(alternatives.flat().filter((s) => SHARED.includes(s) || s === 'operatorToken'), key).toEqual([])
        continue
      }
      expect(alternatives.length, key).toBeGreaterThan(0)
      for (const schemes of alternatives) {
        expect(schemes.some((s) => SHARED.includes(s)), key).toBe(sharedToken)
        expect(schemes.includes('operatorToken'), key).toBe(operatorToken)
      }
    }
  })

  it('takes the shared token as a query parameter where the relay does', () => {
    const inSpec = operations()
      .filter(({ key }) => security(key).flat().some((s) => spec.components.securitySchemes[s]?.in === 'query'))
      .map(({ key }) => key)
    const inRelay = [...relayGuards].filter(([, { queryToken }]) => queryToken).map(([key]) => key)
    expect(inRelay.length).toBeGreaterThan(0)
    expect(inSpec.sort()).toEqual(inRelay.sort())
  })

  it.each(ANSWERS)('documents the $status for $name', async ({ route, status, env, arrange, request }) => {
    Object.assign(process.env, env)
    await arrange?.()
    const res = await app.fetch(request())
    expect(res.status).toBe(status)
    expect(documented(route)).toContain(String(status))
  })

  it('documents only the answers the audit export can give', () => {
    // it reads the webhook events the relay holds and never calls DFNS
    expect(documented('get /dfns/audit/export').sort()).toEqual(['200', '401', '500'])
  })

  it('describes the health body', async () => {
    const body = (await (await app.fetch(get('/health'))).json()) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(bodyKeys('get /health').sort())
  })

  it('describes the status poll body, signed envelope included', async () => {
    process.env.DFNS_STELLAR_WALLET_ID = 'wa-1'
    statusMock.mockResolvedValueOnce({ id: 'sig-1', status: 'Signed', signedData: '0xabcd' })
    const body = (await (await app.fetch(get('/dfns/sign/sig-1/status'))).json()) as Record<string, unknown>
    expect(body.signedTxXdr).toBe('XDR-from-0xabcd')
    expect(bodyKeys('get /dfns/sign/{id}/status')).toEqual(expect.arrayContaining(Object.keys(body)))
  })

  it('describes the transfer body', async () => {
    Object.assign(process.env, TRANSFER_ENV)
    transferMock.mockResolvedValueOnce({ id: 'xfer-1', status: 'Pending', approvalId: 'ap-1' })
    const res = await app.fetch(post('/dfns/transfer', { to: TREASURY, stroops: '1' }, BEARER))
    expect(res.status).toBe(200)
    const body = (await res.json()) as Record<string, unknown>
    expect(Object.keys(body).sort()).toEqual(bodyKeys('post /dfns/transfer').sort())
  })
})

describe('postman collection', () => {
  it('has the requests and answers the spec documents', () => {
    const fromSpec = operations().map(({ key, op }) => {
      const [method, path] = key.split(' ')
      return {
        folder: op.tags[0],
        name: op.summary,
        request: `${method.toUpperCase()} ${path.replace(/\{(\w+)\}/g, ':$1')}`,
        codes: Object.keys(op.responses).sort(),
      }
    })
    const fromCollection = collection.item.flatMap((folder) =>
      folder.item.map((entry) => ({
        folder: folder.name,
        name: entry.name,
        request: `${entry.request.method} /${entry.request.url.path.join('/')}`,
        codes: entry.response.map((r) => String(r.code)).sort(),
      })),
    )
    const byRequest = (a: { request: string }, b: { request: string }) => a.request.localeCompare(b.request)
    expect(fromCollection.sort(byRequest)).toEqual(fromSpec.sort(byRequest))
  })
})
