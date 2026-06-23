import { test, expect } from '@playwright/test'

// the production board carries the four signals and the alert rules are
// provisioned. hits the Grafana HTTP API with a service account token.
// skips unless GRAFANA_URL and the token are set, so it's green off a live
// instance. the token is read from the env, never committed.
const GRAFANA_URL = process.env.GRAFANA_URL ?? ''
const GRAFANA_TOKEN = process.env.GRAFANA_SERVICE_ACCOUNT_TOKEN ?? process.env.GRAFANA_TOKEN ?? ''

const SIGNALS = ['indexer', 'api', 'ttl', 'dfns']

test.describe('Grafana production signals', () => {
  test.beforeEach(() => {
    test.skip(!GRAFANA_URL || !GRAFANA_TOKEN, 'set GRAFANA_URL and GRAFANA_SERVICE_ACCOUNT_TOKEN')
  })

  const auth = () => ({ Authorization: `Bearer ${GRAFANA_TOKEN}` })

  test('the production dashboard has at least the four signal panels', async ({ request }) => {
    const res = await request.get(`${GRAFANA_URL}/api/dashboards/uid/lobster-prod`, { headers: auth() })
    expect(res.status()).toBe(200)
    const body = await res.json()
    const panels = body.dashboard?.panels ?? []
    expect(panels.length).toBeGreaterThanOrEqual(4)
    const titles = panels.map((p: { title?: string }) => (p.title ?? '').toLowerCase()).join(' | ')
    expect(titles).toMatch(/indexer/)
    expect(titles).toMatch(/ttl|storage/)
    expect(titles).toMatch(/dfns/)
  })

  test('every signal has an alert rule provisioned', async ({ request }) => {
    const res = await request.get(`${GRAFANA_URL}/api/v1/provisioning/alert-rules`, { headers: auth() })
    expect(res.status()).toBe(200)
    const rules = (await res.json()) as Array<{ uid?: string; labels?: Record<string, string> }>
    const signalsCovered = new Set(rules.map((r) => r.labels?.signal).filter(Boolean))
    for (const signal of SIGNALS) {
      expect(signalsCovered.has(signal)).toBe(true)
    }
  })
})
