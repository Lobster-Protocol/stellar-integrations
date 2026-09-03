// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.hoisted(() => {
  process.env.DFNS_WEBHOOK_SECRET = 'test-secret-32chars-or-more-long'
  process.env.DASHBOARD_ORIGIN = 'http://localhost:5173'
  process.env.DFNS_STELLAR_NETWORK = 'StellarTestnet'
  process.env.DFNS_TREASURY_ADDRESS = 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU'
  // permissive flag keeps existing /dfns/sign tests passing without
  // having to hand them an amount cap. real deploys must set one or the
  // route returns 503.
  process.env.DFNS_GUARD_PERMISSIVE = '1'
  // permissive stopped meaning "any destination" once the guard started
  // falling back to the treasury paying itself, so the sample payment's
  // destination has to be listed for these tests to reach the sign path.
  process.env.DFNS_DESTINATION_WHITELIST = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
})

const { listPoliciesMock, listWalletsMock, createWalletMock, broadcastMock, waitMock, statusMock } = vi.hoisted(() => ({
  listPoliciesMock: vi.fn(),
  listWalletsMock: vi.fn(),
  createWalletMock: vi.fn(),
  broadcastMock: vi.fn(),
  waitMock: vi.fn(),
  statusMock: vi.fn(),
}))

vi.mock('../dfns/policies', () => ({
  listPolicies: listPoliciesMock,
}))
vi.mock('../dfns/wallets', () => ({
  listWallets: listWalletsMock,
  createStellarWallet: createWalletMock,
}))
vi.mock('../dfns/sign', () => ({
  broadcastStellarTx: broadcastMock,
  waitForSignatureTerminal: waitMock,
  getSignatureStatus: statusMock,
  isTerminal: (s: string) => s === 'Confirmed' || s === 'Failed' || s === 'Rejected',
  envelopeFromSignedData: (hex: string) => ({ toXDR: () => `XDR-from-${hex}` }),
}))
vi.mock('../dfns/approvals', () => ({
  listPendingApprovals: vi.fn(),
  decideApproval: vi.fn(),
}))

import { app } from '../webhook'
import { TransactionBuilder, Networks, Account, BASE_FEE, Operation, Asset } from '@stellar/stellar-sdk'

function buildSampleXdr(): string {
  const src = new Account('GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU', '12345')
  const tx = new TransactionBuilder(src, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.payment({
      destination: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      asset: Asset.native(),
      amount: '1',
    }))
    .setTimeout(60)
    .build()
  return tx.toEnvelope().toXDR('base64')
}


// the api token sign-guard makes /dfns/sign fail-closed. tests that hit
// the sign endpoint set + send the token; the token-guard suite asserts
// the 401 branch with no token presented.
const SIGN_API_TOKEN = 'test-api-token-32-chars-long-x'
// the two custody writes (create a wallet, decide an approval) sit behind a
// second, server-only token on top of the api token.
const OPERATOR_TOKEN = 'test-operator-token-40-chars-long-value'
const WRITE_HEADERS = {
  'content-type': 'application/json',
  authorization: `Bearer ${SIGN_API_TOKEN}`,
  'x-lobster-operator-token': OPERATOR_TOKEN,
}

beforeEach(() => {
  listPoliciesMock.mockReset()
  listWalletsMock.mockReset()
  createWalletMock.mockReset()
  broadcastMock.mockReset()
  waitMock.mockReset()
  statusMock.mockReset()
  process.env.DFNS_STELLAR_WALLET_ID = 'wa-test-1'
})

afterEach(() => {
  delete process.env.LOBSTER_API_TOKEN
  delete process.env.LOBSTER_OPERATOR_TOKEN
})

describe('GET /dfns/policies and /dfns/wallets', () => {
  it('returns the items array from listPolicies on success', async () => {
    listPoliciesMock.mockResolvedValueOnce({ items: [{ id: 'p1' }, { id: 'p2' }] })
    const res = await app.fetch(new Request('http://localhost/dfns/policies'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[] }
    expect(body.items).toHaveLength(2)
  })

  it('returns 502 when listPolicies throws', async () => {
    listPoliciesMock.mockRejectedValueOnce(new Error('dfns down'))
    const res = await app.fetch(new Request('http://localhost/dfns/policies'))
    expect(res.status).toBe(502)
  })

  it('returns the wallets array from listWallets', async () => {
    listWalletsMock.mockResolvedValueOnce([{ id: 'w1', address: 'GA1', name: '', network: 'StellarTestnet' }])
    const res = await app.fetch(new Request('http://localhost/dfns/wallets'))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { items: unknown[] }
    expect(body.items).toHaveLength(1)
  })
})

describe('POST /dfns/wallets', () => {
  // wallet creation is a custody write, fail-closed on the token like /dfns/sign,
  // so set it and present it to reach the real create path.
  beforeEach(() => {
    process.env.LOBSTER_API_TOKEN = SIGN_API_TOKEN
    process.env.LOBSTER_OPERATOR_TOKEN = OPERATOR_TOKEN
  })

  it('creates a stellar testnet wallet with name + network', async () => {
    createWalletMock.mockResolvedValueOnce({
      id: 'w-new',
      address: 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU',
      name: 'lobster-testnet-1',
      network: 'StellarTestnet',
    })
    const res = await app.fetch(
      new Request('http://localhost/dfns/wallets', {
        method: 'POST',
        body: JSON.stringify({ name: 'lobster-testnet-1', network: 'StellarTestnet' }),
        headers: WRITE_HEADERS,
      }),
    )
    expect(res.status).toBe(200)
    expect(createWalletMock).toHaveBeenCalledWith('lobster-testnet-1', 'StellarTestnet')
  })

  it('returns 400 when network is not Stellar/StellarTestnet', async () => {
    const res = await app.fetch(
      new Request('http://localhost/dfns/wallets', {
        method: 'POST',
        body: JSON.stringify({ name: 'foo', network: 'Ethereum' }),
        headers: WRITE_HEADERS,
      }),
    )
    expect(res.status).toBe(400)
    expect(createWalletMock).not.toHaveBeenCalled()
  })

  it('returns 400 when name is missing', async () => {
    const res = await app.fetch(
      new Request('http://localhost/dfns/wallets', {
        method: 'POST',
        body: JSON.stringify({ network: 'StellarTestnet' }),
        headers: WRITE_HEADERS,
      }),
    )
    expect(res.status).toBe(400)
    expect(createWalletMock).not.toHaveBeenCalled()
  })

  it('returns 400 on a malformed json body', async () => {
    const res = await app.fetch(
      new Request('http://localhost/dfns/wallets', {
        method: 'POST',
        body: '{ malformed',
        headers: WRITE_HEADERS,
      }),
    )
    expect(res.status).toBe(400)
  })

  it('returns 502 when DFNS create throws', async () => {
    createWalletMock.mockRejectedValueOnce(new Error('dfns down'))
    const res = await app.fetch(
      new Request('http://localhost/dfns/wallets', {
        method: 'POST',
        body: JSON.stringify({ name: 'x', network: 'StellarTestnet' }),
        headers: WRITE_HEADERS,
      }),
    )
    expect(res.status).toBe(502)
  })
})

describe('POST /dfns/sign', () => {
  const sampleXdr = buildSampleXdr
  // every /dfns/sign test needs the api token + treasury env set, with
  // the token passed through as a bearer header.
  function signRequest(body: object): Request {
    return new Request('http://localhost/dfns/sign', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${SIGN_API_TOKEN}` },
    })
  }

  beforeEach(() => {
    process.env.LOBSTER_API_TOKEN = SIGN_API_TOKEN
  })

  it('fails closed with 503 when LOBSTER_API_TOKEN is unset', async () => {
    delete process.env.LOBSTER_API_TOKEN
    const res = await app.fetch(signRequest({ xdr: sampleXdr() }))
    expect(res.status).toBe(503)
  })

  it('returns 503 when DFNS_TREASURY_ADDRESS is unset', async () => {
    const t = process.env.DFNS_TREASURY_ADDRESS
    delete process.env.DFNS_TREASURY_ADDRESS
    try {
      const res = await app.fetch(signRequest({ xdr: sampleXdr() }))
      expect(res.status).toBe(503)
    } finally {
      if (t) process.env.DFNS_TREASURY_ADDRESS = t
    }
  })

  it('returns 503 when the wallet id env is unset', async () => {
    delete process.env.DFNS_STELLAR_WALLET_ID
    const res = await app.fetch(signRequest({ xdr: sampleXdr() }))
    expect(res.status).toBe(503)
  })

  it('returns 400 when xdr is missing', async () => {
    const res = await app.fetch(signRequest({}))
    expect(res.status).toBe(400)
  })

  it('returns 400 when caller passphrase mismatches the server env', async () => {
    const res = await app.fetch(
      signRequest({
        xdr: sampleXdr(),
        networkPassphrase: 'Public Global Stellar Network ; September 2015',
      }),
    )
    expect(res.status).toBe(400)
    expect(broadcastMock).not.toHaveBeenCalled()
  })

  it('returns 502 when dfns returns no signed envelope', async () => {
    broadcastMock.mockResolvedValueOnce({ id: 'sig-1', status: 'Pending' })
    waitMock.mockResolvedValueOnce({ id: 'sig-1', status: 'Failed' })
    const res = await app.fetch(signRequest({ xdr: sampleXdr() }))
    expect(res.status).toBe(502)
  })

  it('returns the signed envelope when dfns completes', async () => {
    broadcastMock.mockResolvedValueOnce({ id: 'sig-1', status: 'Pending' })
    waitMock.mockResolvedValueOnce({ id: 'sig-1', status: 'Confirmed', signedData: 'deadbeef' })
    const res = await app.fetch(signRequest({ xdr: sampleXdr() }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { signedTxXdr: string }
    expect(body.signedTxXdr).toBe('XDR-from-deadbeef')
  })

  it('hands back a pending id when the tx is held for approval', async () => {
    broadcastMock.mockResolvedValueOnce({ id: 'sig-9', status: 'Pending' })
    waitMock.mockResolvedValueOnce({ id: 'sig-9', status: 'Pending' })
    const res = await app.fetch(signRequest({ xdr: sampleXdr() }))
    expect(res.status).toBe(200)
    const body = (await res.json()) as { pending: boolean; id: string }
    expect(body.pending).toBe(true)
    expect(body.id).toBe('sig-9')
  })
})

describe('GET /dfns/sign/:id/status', () => {
  beforeEach(() => {
    process.env.LOBSTER_API_TOKEN = SIGN_API_TOKEN
  })

  it('returns the current dfns status and hash', async () => {
    statusMock.mockResolvedValueOnce({ id: 'sig-9', status: 'Confirmed', txHash: 'abc123' })
    const res = await app.fetch(
      new Request('http://localhost/dfns/sign/sig-9/status', {
        headers: { authorization: `Bearer ${SIGN_API_TOKEN}` },
      }),
    )
    expect(res.status).toBe(200)
    const body = (await res.json()) as { status: string; txHash: string }
    expect(body.status).toBe('Confirmed')
    expect(body.txHash).toBe('abc123')
  })
})

describe('POST /dfns/approvals/:id/decision', () => {
  it('fails closed with 503 when LOBSTER_API_TOKEN is unset', async () => {
    delete process.env.LOBSTER_API_TOKEN
    // operator token present and presented, so the 503 can only come from the
    // missing api token rather than from the operator gate in front of it
    process.env.LOBSTER_OPERATOR_TOKEN = OPERATOR_TOKEN
    const res = await app.fetch(
      new Request('http://localhost/dfns/approvals/ap-1/decision', {
        method: 'POST',
        body: JSON.stringify({ value: 'Approved' }),
        headers: {
          'content-type': 'application/json',
          'x-lobster-operator-token': OPERATOR_TOKEN,
        },
      }),
    )
    expect(res.status).toBe(503)
  })
})

describe('token guard on read endpoints', () => {
  it('keeps /dfns/wallets POST behind the token guard', async () => {
    process.env.LOBSTER_API_TOKEN = SIGN_API_TOKEN
    const res = await app.fetch(
      new Request('http://localhost/dfns/wallets', {
        method: 'POST',
        body: JSON.stringify({ name: 'x', network: 'StellarTestnet' }),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(res.status).toBe(401)
  })

  it('keeps /dfns/sign behind the token guard', async () => {
    process.env.LOBSTER_API_TOKEN = SIGN_API_TOKEN
    const res = await app.fetch(
      new Request('http://localhost/dfns/sign', {
        method: 'POST',
        body: JSON.stringify({ xdr: 'AAAA' }),
        headers: { 'content-type': 'application/json' },
      }),
    )
    expect(res.status).toBe(401)
  })
})
