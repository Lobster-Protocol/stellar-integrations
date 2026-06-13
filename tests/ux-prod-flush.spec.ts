import { test, expect } from '@playwright/test'

// prod smoke for the 2026-05-11 chore(t1) batch (commit 0bd9b4d). one
// test per artifact so a regression points straight at the missing piece.
// raw http where possible to keep assertions cheap and errors specific.
import { BASE } from './fixtures'

test.describe('chore(t1) batch flush - prod assertions', () => {
  test('robots.txt is served', async ({ request }) => {
    const r = await request.get(`${BASE}/robots.txt`)
    expect(r.status()).toBe(200)
    expect((await r.text()).toLowerCase()).toContain('user-agent')
  })

  test('crawlers are told to skip the preview deploy', async ({ request }) => {
    const r = await request.get(BASE)
    const html = await r.text()
    expect(html).toMatch(/name="robots"\s+content="noindex/)
    // robots.txt also blocks crawling
    const robots = await (await request.get(`${BASE}/robots.txt`)).text()
    expect(robots).toMatch(/Disallow:\s*\//)
    // No social / OG leakage while the dashboard is still in dev
    expect(html).not.toMatch(/property="og:title"/)
    expect(html).not.toMatch(/name="twitter:site"/)
  })

  test('custom /404 page renders with NotFound content', async ({ page }) => {
    await page.goto(`${BASE}/this-route-does-not-exist`)
    // App routes unknown -> /404 -> NotFound component
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('link', { name: /Go to Overview/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /Go to Positions/i })).toBeVisible()
  })

  test('Footer is rendered on root with licence + Factory link', async ({ page }) => {
    await page.goto(BASE)
    const footer = page.locator('footer')
    await expect(footer).toBeVisible({ timeout: 15_000 })
    await expect(footer).toContainText(/MIT/)
    // factory link present when testnet contract is configured
    await expect(footer.getByRole('link', { name: /Factory/i })).toBeVisible()
  })

  test('Skip-to-content link exists and targets main', async ({ page }) => {
    await page.goto(BASE)
    const skip = page.getByRole('link', { name: /Skip to main content/i })
    await expect(skip).toHaveAttribute('href', '#main-content')
    await expect(page.locator('#main-content')).toBeVisible()
  })

  test('Preview-data badge shows up on the strategy pages', async ({ page }) => {
    await page.goto(`${BASE}/performance`)
    await expect(page.getByText(/Preview data\./)).toBeVisible({ timeout: 15_000 })
  })

  test('Positions page renders Factory card + LiveDataMeta refresh button', async ({ page }) => {
    await page.goto(`${BASE}/positions`)
    await expect(page.getByRole('heading', { name: /Factory contract/i })).toBeVisible({ timeout: 15_000 })
    // "updated ..." label from LiveDataMeta
    await expect(page.getByText(/updated /).first()).toBeVisible()
    // Refresh icon button
    await expect(page.getByRole('button', { name: /Refresh/i }).first()).toBeVisible()
  })

  test('Bridges page shows live Trustline branch (Connect wallet, not hardcoded Active)', async ({ page }) => {
    await page.goto(`${BASE}/bridges`)
    // No wallet connected -> live branch shows "Connect wallet"
    await expect(page.getByText('Connect wallet').first()).toBeVisible({ timeout: 15_000 })
    // And the old hardcoded text-green Active in Trustline cell is gone
    const trustlineCell = page.locator('p:has-text("Trustline Status")').locator('..')
    await expect(trustlineCell).not.toContainText(/^Active$/)
  })

  test('Mobile drawer toggle button has aria-expanded + aria-controls', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.goto(BASE)
    const menuBtn = page.getByRole('button', { name: /Open menu/i })
    await expect(menuBtn).toBeVisible({ timeout: 15_000 })
    await expect(menuBtn).toHaveAttribute('aria-controls', 'mobile-nav-drawer')
    await menuBtn.click()
    // drawer opens, role=dialog
    await expect(page.locator('#mobile-nav-drawer[role="dialog"]')).toBeVisible()
    // close on Escape
    await page.keyboard.press('Escape')
    await expect(page.locator('#mobile-nav-drawer')).not.toBeVisible()
  })
})
