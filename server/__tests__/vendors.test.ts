import { describe, it, expect, vi, afterEach } from 'vitest'
import { readComponents, vendorStatus } from '../probe/vendors'

const page = {
  components: [
    { id: 'g1', name: 'Circle Cross-Chain Transfer Protocol', status: 'operational', group_id: null },
    { id: 'c1', name: 'Attestation Service', status: 'degraded_performance', group_id: 'g1' },
    { id: 'c2', name: 'Attestation Service', status: 'major_outage', group_id: 'g9' },
    { id: 'c3', name: 'Circle CCTP - Sandbox', status: 'major_outage', group_id: 'g1' },
    { id: 'c4', name: 'XLM - Cross-Chain Minting and Burning', status: 'on_fire', group_id: 'g1' },
  ],
}

describe('readComponents', () => {
  it('maps a watched component to its level, inside the named group', () => {
    const out = readComponents('circle', page)
    expect(out).toContainEqual({ vendor: 'circle', component: 'cctp-attestation', level: 2 })
    expect(out).toContainEqual({ vendor: 'circle', component: 'cctp-sandbox', level: 4 })
  })

  it('leaves out a status it does not know rather than guess', () => {
    expect(readComponents('circle', page).find((r) => r.component === 'cctp-stellar')).toBeUndefined()
  })

  it('leaves out a component the page no longer lists', () => {
    expect(readComponents('dfns', { components: [] })).toEqual([])
    expect(readComponents('dfns', {})).toEqual([])
  })

  it('matches on name alone when no group is named', () => {
    const out = readComponents('dfns', {
      components: [{ id: 'd1', name: 'Signing Engine', status: 'partial_outage', group_id: 'x' }],
    })
    expect(out).toEqual([{ vendor: 'dfns', component: 'signing', level: 3 }])
  })
})

describe('readComponents against odd statuses', () => {
  it('never turns an object key into a level', () => {
    const out = readComponents('dfns', {
      components: [
        { id: 'd1', name: 'REST API', status: 'constructor', group_id: null },
        { id: 'd2', name: 'Signing Engine', status: '__proto__', group_id: null },
      ],
    })
    expect(out).toEqual([])
  })
})

describe('vendorStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('keeps the last good read through a failed one, for half an hour at most', async () => {
    const page = { components: [{ id: 'd1', name: 'REST API', status: 'operational', group_id: null }] }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(page), { status: 200 })))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const t0 = 1_000_000_000
    const dfnsApi = (rs: Array<{ vendor: string; component: string }>) => rs.some((r) => r.vendor === 'dfns' && r.component === 'api')

    expect(dfnsApi(await vendorStatus(t0))).toBe(true)

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('timeout') }))
    expect(dfnsApi(await vendorStatus(t0 + 6 * 60_000))).toBe(true)
    expect(await vendorStatus(t0 + 40 * 60_000)).toEqual([])
  })
})
