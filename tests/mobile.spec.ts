import { test, expect } from '@playwright/test'

import { BASE } from './fixtures'

test.use({ viewport: { width: 375, height: 812 } }) // iPhone X

test('mobile: sidebar is hidden, hamburger menu visible', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.screenshot({ path: 'screenshots/mobile-overview.png' })

  const sidebar = page.locator('aside')
  await expect(sidebar).toBeHidden()

  // the hamburger has no accessible name, so match the first icon button
  const menuBtn = page.locator('button').filter({ has: page.locator('svg') }).first()
  await expect(menuBtn).toBeVisible()
})

test('mobile: hamburger opens nav drawer', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })

  const menuBtn = page.locator('button').filter({ has: page.locator('svg') }).first()
  await menuBtn.click()
  await page.waitForTimeout(300)

  await page.screenshot({ path: 'screenshots/mobile-menu-open.png' })

  const perfLink = page.getByRole('link', { name: 'Performance' })
  await expect(perfLink).toBeVisible()

  await perfLink.click()
  await page.waitForTimeout(500)

  const heading = page.getByRole('heading', { name: 'Performance' })
  await expect(heading).toBeVisible()

  await page.screenshot({ path: 'screenshots/mobile-performance.png' })
})

test('mobile: connect wallet button works', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })

  const connectBtn = page.getByRole('button', { name: 'Connect Wallet' }).first()
  await expect(connectBtn).toBeVisible()
  await connectBtn.click()
  await page.waitForTimeout(2000)

  await page.screenshot({ path: 'screenshots/mobile-wallet-modal.png' })
})
