// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest'

import { otlpEnabled, parseExposition, toOtlp, pushExposition } from '../metrics/otlp'

const TEXT = `# HELP lobster_probe_up dependency reachable (1) or down (0)
# TYPE lobster_probe_up gauge
lobster_probe_up{target="dfns-api",area="custody"} 1

lobster_ttl_latest_ledger{network="testnet"} 1234567
http_request_duration_seconds_bucket{le="+Inf",route="/health"} 12
odd{note="say \\"hi\\""} 3
never_set NaN
up 1
`

describe('parseExposition', () => {
  it('reads labelled and bare samples, skips comments and blanks', () => {
    const s = parseExposition(TEXT)
    expect(s.map((x) => x.name)).toEqual([
      'lobster_probe_up',
      'lobster_ttl_latest_ledger',
      'http_request_duration_seconds_bucket',
      'odd',
      'up',
    ])
    expect(s[0]).toEqual({ name: 'lobster_probe_up', labels: { target: 'dfns-api', area: 'custody' }, value: 1 })
    expect(s[4]).toEqual({ name: 'up', labels: {}, value: 1 })
  })

  it('keeps +Inf as a label but drops a NaN value', () => {
    const s = parseExposition(TEXT)
    expect(s[2].labels.le).toBe('+Inf')
    expect(s.find((x) => x.name === 'never_set')).toBeUndefined()
  })

  it('unescapes quotes inside a label value', () => {
    expect(parseExposition(TEXT)[3].labels.note).toBe('say "hi"')
  })
})

describe('toOtlp', () => {
  it('names the service after the job and stamps push_time_seconds', () => {
    const body = toOtlp(parseExposition('lobster_probe_up{target="x"} 0\n'), 'lobster-probe', 'lobster-relay', 1_700_000_000_000)
    const rm = body.resourceMetrics[0]
    expect(rm.resource.attributes).toEqual([{ key: 'service.name', value: { stringValue: 'lobster-probe' } }])

    const byName = Object.fromEntries(rm.scopeMetrics[0].metrics.map((m) => [m.name, m.gauge.dataPoints]))
    expect(byName.lobster_probe_up[0].asDouble).toBe(0)
    expect(byName.lobster_probe_up[0].attributes).toContainEqual({ key: 'source', value: { stringValue: 'lobster-relay' } })
    expect(byName.push_time_seconds[0].asDouble).toBe(1_700_000_000)
    expect(byName.push_time_seconds[0].timeUnixNano).toBe('1700000000000000000')
  })
})

describe('pushExposition', () => {
  const env = { GRAFANA_OTLP_URL: 'https://otlp.example/otlp/', GRAFANA_OTLP_USER: '42', GRAFANA_OTLP_TOKEN: 'tok' }
  afterEach(() => vi.unstubAllGlobals())

  it('is off until url, user and token are all set', () => {
    expect(otlpEnabled(env)).toBe(true)
    expect(otlpEnabled({ ...env, GRAFANA_OTLP_TOKEN: '' })).toBe(false)
    expect(otlpEnabled({})).toBe(false)
  })

  it('posts json to /v1/metrics with basic auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await pushExposition('up 1\n', 'lobster-relay', env)

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://otlp.example/otlp/v1/metrics')
    expect(init.headers.authorization).toBe('Basic ' + Buffer.from('42:tok').toString('base64'))
    expect(JSON.parse(init.body).resourceMetrics[0].resource.attributes[0].value.stringValue).toBe('lobster-relay')
  })

  it('throws when the gateway refuses the push', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 401 })))
    await expect(pushExposition('up 1\n', 'lobster-relay', env)).rejects.toThrow('401')
  })
})
