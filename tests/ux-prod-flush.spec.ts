import { test, expect } from '@playwright/test'

// what a deploy has to serve before anyone logs in. raw http where it can be,
// so a failure names the missing header or file rather than a locator. split
// one per artifact on purpose: a batched version told us "something is off"
// and nothing more.
import { BASE } from './fixtures'

test.describe('what the deploy serves before anyone logs in', () => {
  test('serves a robots.txt at all', async ({ request }) => {
    const r = await request.get(`${BASE}/robots.txt`)
    expect(r.status()).toBe(200)
    expect((await r.text()).toLowerCase()).toContain('user-agent')
  })

  test('crawlers are told to skip the preview deploy', async ({ request }) => {
    const r = await request.get(BASE)
    const html = await r.text()
    expect(html).toMatch(/name="robots"\s+content="noindex/)
    const robots = await (await request.get(`${BASE}/robots.txt`)).text()
    expect(robots).toMatch(/Disallow:\s*\//)
    // No social / OG leakage while the dashboard is still in dev
    expect(html).not.toMatch(/property="og:title"/)
    expect(html).not.toMatch(/name="twitter:site"/)
  })

  test('a dead route gets our own 404, with a way back', async ({ page }) => {
    await page.goto(`${BASE}/this-route-does-not-exist`)
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('link', { name: /Go to Overview/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Go to Positions/i })).toBeVisible()
  })

  test('the footer carries the licence and a link to the factory', async ({ page }) => {
    await page.goto(BASE)
    const footer = page.locator('footer')
    await expect(footer).toBeVisible({ timeout: 15_000 })
    await expect(footer).toContainText(/MIT/)
    // factory link present when testnet contract is configured
    await expect(footer.getByRole('link', { name: /Factory/i })).toBeVisible()
  })

  test('keyboard users can skip straight to the content', async ({ page }) => {
    await page.goto(BASE)
    const skip = page.getByRole('link', { name: /Skip to main content/i })
    await expect(skip).toHaveAttribute('href', '#main-content')
    await expect(page.locator('#main-content')).toBeVisible()
  })

  test('positions comes back with the factory card and its refresh', async ({ page }) => {
    await page.goto(`${BASE}/positions`)
    await expect(page.getByRole('heading', { name: /Factory contract/i })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(/updated /).first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Refresh/i }).first()).toBeVisible()
  })

  test('the trustline tile reads the wallet, never a hardcoded Active', async ({ page }) => {
    await page.goto(`${BASE}/bridges`)
    await expect(page.getByText('Connect wallet').first()).toBeVisible({ timeout: 15_000 })
    // and the trustline tile reports the live branch, never a hardcoded Active.
    // the label carries a help tip beside it, so anchor on the tile, not the word
    const trustline = page
      .getByText('Trustline', { exact: false })
      .first()
      .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]')
    await expect(trustline).toContainText(/Connect wallet/i)
    await expect(trustline).not.toContainText('Active')
  })

  test('the drawer toggle names the drawer it opens, and Escape closes it', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto(BASE)
    const menuBtn = page.getByRole('button', { name: /Open menu/i })
    await expect(menuBtn).toBeVisible({ timeout: 15_000 })
    await expect(menuBtn).toHaveAttribute('aria-controls', 'mobile-nav-drawer')
    await menuBtn.click()
    await expect(page.locator('#mobile-nav-drawer[role="dialog"]')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('#mobile-nav-drawer')).not.toBeVisible()
  })
})
