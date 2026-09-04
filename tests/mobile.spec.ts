import { test, expect } from '@playwright/test'

import { BASE } from './fixtures'

// this file doubles as the screenshot pass for the phone layout, which is why
// it walks ground ux-navigation already covers. the images it writes go in the
// submission, so the walk stays even where the assertions live elsewhere too.
test.use({ viewport: { width: 375, height: 812 } }) // iPhone X

test('trades the sidebar for a menu button at phone width', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.screenshot({ path: 'screenshots/mobile-overview.png' })

  const sidebar = page.locator('aside')
  await expect(sidebar).toBeHidden()

  // TopBar labels it, so ask for it by name rather than taking whichever icon
  // button sits first in the DOM
  const menuBtn = page.getByRole('button', { name: /Open menu/i })
  await expect(menuBtn).toBeVisible()
})

test('gets to performance through the drawer', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })

  const menuBtn = page.getByRole('button', { name: /Open menu/i })
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

test('brings the wallets kit up at phone width', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })

  const connectBtn = page.getByRole('button', { name: 'Connect Wallet' }).first()
  await expect(connectBtn).toBeVisible()
  await connectBtn.click()

  // the kit modal has to actually come up at phone width, which is the part
  // the screenshot alone never checked
  const modal = page.locator('section.stellar-wallets-kit')
  await expect(modal).toBeVisible()
  await expect(modal.getByRole('heading', { name: 'Connect Wallet' })).toBeVisible()

  await page.screenshot({ path: 'screenshots/mobile-wallet-modal.png' })
})
