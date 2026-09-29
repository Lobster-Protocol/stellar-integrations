import { test, expect } from '@playwright/test'

// noindex until launch. DOCS_BASE_URL points at a served build, `npm run serve`
// in lobster-docs or the hosted site
const DOCS_BASE = process.env.DOCS_BASE_URL ?? ''

const PAGES = [
  '/',
  '/onboarding-institutional',
  '/integrations/bridge',
  '/integrations/allbridge',
  '/integrations/wallets-kit',
  '/integrations/stellar-broker',
  '/integrations/dfns',
]

test.describe('Docs site', () => {
  test.beforeEach(() => {
    test.skip(!DOCS_BASE, 'set DOCS_BASE_URL to a served docs build')
  })

  for (const path of PAGES) {
    test(`serves ${path} with a noindex robots tag`, async ({ request, page }) => {
      const res = await request.get(`${DOCS_BASE}${path}`)
      expect(res.status()).toBe(200)
      await page.goto(`${DOCS_BASE}${path}`)
      const robots = page.locator('meta[name="robots"]')
      await expect(robots).toHaveAttribute('content', /noindex/i)
    })
  }

  test('publishes the generated API reference', async ({ request }) => {
    // the openapi plugin emits the bff under /api, and the intro page it names
    // after the spec title is the stable entry the sidebar links to
    const res = await request.get(`${DOCS_BASE}/api/lobster-bff`)
    expect([200, 301, 302]).toContain(res.status())
  })
})
