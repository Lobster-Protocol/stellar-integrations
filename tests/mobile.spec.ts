import { test, expect } from '@playwright/test'

const BASE = 'https://stellar-integrations-blush.vercel.app'

// test on a mobile viewport
test.use({ viewport: { width: 375, height: 812 } }) // iPhone X

test('mobile: sidebar is hidden, hamburger menu visible', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.screenshot({ path: 'screenshots/mobile-overview.png' })

  // sidebar should be hidden
  const sidebar = page.locator('aside')
  await expect(sidebar).toBeHidden()

  // hamburger button should be visible
  const menuBtn = page.locator('button').filter({ has: page.locator('svg') }).first()
  await expect(menuBtn).toBeVisible()
})

test('mobile: hamburger opens nav drawer', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'networkidle' })

  // click hamburger (first button with svg)
  const menuBtn = page.locator('button').filter({ has: page.locator('svg') }).first()
  await menuBtn.click()
  await page.waitForTimeout(300)

  await page.screenshot({ path: 'screenshots/mobile-menu-open.png' })

  // should see nav links
  const perfLink = page.getByRole('link', { name: 'Performance' })
  await expect(perfLink).toBeVisible()

  // click Performance
  await perfLink.click()
  await page.waitForTimeout(500)

  // drawer should close and Performance page should load
  const heading = page.getByText('Strategy Performance')
  await expect(heading).toBeVisible()

  await page.screenshot({ path: 'screenshots/mobile-performance.png' })
})

test('mobile: connect wallet button works', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'networkidle' })

  const connectBtn = page.getByRole('button', { name: 'Connect Wallet' }).first()
  await expect(connectBtn).toBeVisible()
  await connectBtn.click()
  await page.waitForTimeout(2000)

  await page.screenshot({ path: 'screenshots/mobile-wallet-modal.png' })
})
