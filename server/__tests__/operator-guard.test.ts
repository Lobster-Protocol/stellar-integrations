// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.hoisted(() => {
  process.env.DFNS_WEBHOOK_SECRET = 'test-secret-32chars-or-more-long'
  process.env.DASHBOARD_ORIGIN = 'http://localhost:5173'
})

const { createWalletMock, listWalletsMock, decideMock, listApprovalsMock } = vi.hoisted(() => ({
  createWalletMock: vi.fn(),
  listWalletsMock: vi.fn(),
  decideMock: vi.fn(),
  listApprovalsMock: vi.fn(),
}))

vi.mock('../dfns/wallets', () => ({
  listWallets: listWalletsMock,
  createStellarWallet: createWalletMock,
}))
vi.mock('../dfns/approvals', () => ({
  listPendingApprovals: listApprovalsMock,
  decideApproval: decideMock,
}))

import { app } from '../webhook'

const API_TOKEN = 'test-api-token-32-chars-long-x'
const OPERATOR_TOKEN = 'test-operator-token-40-chars-long-value'

// both write routes take the same pair of tokens, so the suite drives them
// through one builder rather than repeating the header block eight times.
function write(path: string, headers: Record<string, string>, body = '{ malformed'): Request {
  return new Request(`http://localhost${path}`, {
    method: 'POST',
    body,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

const WALLETS = '/dfns/wallets'
const DECISION = '/dfns/approvals/ap-1/decision'

beforeEach(() => {
  createWalletMock.mockReset()
  listWalletsMock.mockReset()
  decideMock.mockReset()
  listApprovalsMock.mockReset()
  process.env.LOBSTER_API_TOKEN = API_TOKEN
})

afterEach(() => {
  delete process.env.LOBSTER_API_TOKEN
  delete process.env.LOBSTER_OPERATOR_TOKEN
})

describe('operator guard with LOBSTER_OPERATOR_TOKEN unset', () => {
  for (const path of [WALLETS, DECISION]) {
    it(`refuses ${path} with 503 and never calls DFNS`, async () => {
      delete process.env.LOBSTER_OPERATOR_TOKEN
      const res = await app.fetch(
        write(path, { authorization: `Bearer ${API_TOKEN}` }, JSON.stringify({ value: 'Approved' })),
      )
      expect(res.status).toBe(503)
      const body = (await res.json()) as { error: string }
      expect(body.error).toMatch(/LOBSTER_OPERATOR_TOKEN/)
      expect(createWalletMock).not.toHaveBeenCalled()
      expect(decideMock).not.toHaveBeenCalled()
    })
  }

  it('leaves the read routes answering when only the operator token is unset', async () => {
    delete process.env.LOBSTER_OPERATOR_TOKEN
    listWalletsMock.mockResolvedValueOnce([])
    const res = await app.fetch(
      new Request(`http://localhost${WALLETS}`, {
        headers: { authorization: `Bearer ${API_TOKEN}` },
      }),
    )
    expect(res.status).toBe(200)
  })
})

describe('operator guard with LOBSTER_OPERATOR_TOKEN set', () => {
  beforeEach(() => {
    process.env.LOBSTER_OPERATOR_TOKEN = OPERATOR_TOKEN
  })

  for (const path of [WALLETS, DECISION]) {
    it(`refuses ${path} with 401 when the operator header is absent`, async () => {
      const res = await app.fetch(
        write(path, { authorization: `Bearer ${API_TOKEN}` }, JSON.stringify({ value: 'Approved' })),
      )
      expect(res.status).toBe(401)
      expect(createWalletMock).not.toHaveBeenCalled()
      expect(decideMock).not.toHaveBeenCalled()
    })

    it(`refuses ${path} with 401 on a wrong operator token of the same length`, async () => {
      const wrong = OPERATOR_TOKEN.slice(0, -1) + (OPERATOR_TOKEN.endsWith('e') ? 'f' : 'e')
      const res = await app.fetch(
        write(
          path,
          { authorization: `Bearer ${API_TOKEN}`, 'x-lobster-operator-token': wrong },
          JSON.stringify({ value: 'Approved' }),
        ),
      )
      expect(res.status).toBe(401)
      expect(createWalletMock).not.toHaveBeenCalled()
      expect(decideMock).not.toHaveBeenCalled()
    })

    it(`refuses ${path} with 401 on an operator token of the wrong length`, async () => {
      const res = await app.fetch(
        write(
          path,
          { authorization: `Bearer ${API_TOKEN}`, 'x-lobster-operator-token': 'short' },
          JSON.stringify({ value: 'Approved' }),
        ),
      )
      expect(res.status).toBe(401)
    })

    it(`lets ${path} reach its handler with the right operator token`, async () => {
      // a malformed body proves the handler ran: the guards answer 401/503
      // before any parsing, so only the route itself can say 'bad json'.
      const res = await app.fetch(
        write(path, {
          authorization: `Bearer ${API_TOKEN}`,
          'x-lobster-operator-token': OPERATOR_TOKEN,
        }),
      )
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toBe('bad json')
    })
  }

  it('creates a wallet once both tokens are presented', async () => {
    createWalletMock.mockResolvedValueOnce({
      id: 'w-new',
      address: 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU',
      name: 'operator-made',
      network: 'StellarTestnet',
    })
    const res = await app.fetch(
      write(
        WALLETS,
        {
          authorization: `Bearer ${API_TOKEN}`,
          'x-lobster-operator-token': OPERATOR_TOKEN,
        },
        JSON.stringify({ name: 'operator-made', network: 'StellarTestnet' }),
      ),
    )
    expect(res.status).toBe(200)
    expect(createWalletMock).toHaveBeenCalledWith('operator-made', 'StellarTestnet')
  })

  it('decides an approval once both tokens are presented', async () => {
    decideMock.mockResolvedValueOnce({ id: 'ap-1', status: 'Approved' })
    const res = await app.fetch(
      write(
        DECISION,
        {
          authorization: `Bearer ${API_TOKEN}`,
          'x-lobster-operator-token': OPERATOR_TOKEN,
        },
        JSON.stringify({ value: 'Approved', reason: 'checked with the desk' }),
      ),
    )
    expect(res.status).toBe(200)
    expect(decideMock).toHaveBeenCalledWith('ap-1', 'Approved', 'checked with the desk')
  })

  it('still refuses the write when the api token is missing', async () => {
    const res = await app.fetch(
      write(
        WALLETS,
        { 'x-lobster-operator-token': OPERATOR_TOKEN },
        JSON.stringify({ name: 'x', network: 'StellarTestnet' }),
      ),
    )
    expect(res.status).toBe(401)
    expect(createWalletMock).not.toHaveBeenCalled()
  })
})
