import { test, expect, type Page } from '@playwright/test'

import { gotoWithWallet, BASE } from './fixtures'

async function gotoNoWallet(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
}

test.describe('Cross-page navigation', () => {
  test('Overview renders Portfolio header on /', async ({ page }) => {
    await gotoWithWallet(page)
    await expect(page.getByText('Portfolio').first()).toBeVisible()
  })

  test('Performance renders a chart', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('link', { name: /Performance/ }).click()
    await expect(page).toHaveURL(/\/performance$/)
    // the curve, not just the route: the card frame is there either way, so
    // the plotted series is what says the history actually came back
    await expect(page.getByRole('heading', { name: 'Wallet balance over time' })).toBeVisible()
    await expect(page.locator('.recharts-area-curve').first()).toBeVisible({ timeout: 25_000 })
  })

  test('Activity routes to /activity and renders the heading', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('link', { name: /^Activity$/ }).click()
    await expect(page).toHaveURL(/\/activity$/)
    await expect(page.getByRole('heading', { name: 'Activity', exact: true })).toBeVisible()
  })

  test('Allocation navigates to /allocation', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('link', { name: /Allocation/ }).click()
    await expect(page).toHaveURL(/\/allocation$/)
  })

  test('Bridges navigates to /bridges and shows Allbridge provider info', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('link', { name: /^Bridges$/ }).click()
    await expect(page).toHaveURL(/\/bridges$/)
    // the provider tile names who carries the USDC across, which is the piece
    // the test is called after. anchored on the tile so a stray mention of the
    // name elsewhere on the page cannot stand in for it.
    const provider = page
      .getByText('Provider', { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]')
    await expect(provider).toContainText('Allbridge Core')
  })

  test('Positions navigates to /positions and renders the heading', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('link', { name: 'Positions', exact: true }).click()
    await expect(page).toHaveURL(/\/positions$/)
    await expect(page.getByRole('heading', { name: 'Positions' })).toBeVisible()
  })

  test('junk URL redirects to the custom /404 page', async ({ page }) => {
    await gotoWithWallet(page)
    await page.goto(`${BASE}/this-does-not-exist`, { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/404$/)
    await expect(page.getByRole('heading', { name: '404' })).toBeVisible()
  })

  test('browser back restores the previous route', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('link', { name: /Performance/ }).click()
    await page.getByRole('link', { name: /^Activity$/ }).click()
    await page.goBack()
    await expect(page).toHaveURL(/\/performance$/)
  })

  test('browser forward re-applies the navigation', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('link', { name: /Performance/ }).click()
    await page.getByRole('link', { name: /^Activity$/ }).click()
    await page.goBack()
    await page.goForward()
    await expect(page).toHaveURL(/\/activity$/)
  })

  test('sidebar active highlight follows the URL', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('link', { name: /Performance/ }).click()
    // The active link has the primary-tinted classes
    const active = page.getByRole('link', { name: /Performance/ })
    await expect(active).toHaveClass(/bg-primary/)
  })
})

test.describe('Mobile responsiveness', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('sidebar hidden, hamburger visible at iPhone-X viewport', async ({ page }) => {
    await gotoNoWallet(page)
    await expect(page.locator('aside').first()).toBeHidden()
  })

  test('hamburger opens drawer with the 6 nav items', async ({ page }) => {
    await gotoNoWallet(page)
    // by accessible name, not "first button holding an svg": that matched
    // whichever icon button happened to come first in the DOM
    const hamburger = page.getByRole('button', { name: /Open menu/i })
    await hamburger.click()
    for (const label of ['Overview', 'Performance', 'Activity', 'Allocation', 'Bridges', 'Positions']) {
      await expect(page.getByRole('link', { name: new RegExp(`^${label}$`) }).first()).toBeVisible()
    }
  })

  test('Connect Wallet button reachable on mobile', async ({ page }) => {
    await gotoNoWallet(page)
    // Two Connect Wallet buttons render when no wallet is connected: one
    // in the TopBar and one in the Overview empty state. We only assert
    // that at least one is visible to the user.
    await expect(page.getByRole('button', { name: /Connect Wallet/ }).first()).toBeVisible()
  })
})

test.describe('Network toggle', () => {
  test('TopBar shows Testnet and Mainnet buttons', async ({ page }) => {
    await gotoWithWallet(page)
    await expect(page.getByRole('button', { name: 'Testnet' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mainnet' })).toBeVisible()
  })

  test('clicking Mainnet persists choice to localStorage', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('button', { name: 'Mainnet' }).click()
    const stored = await page.evaluate(() => localStorage.getItem('lob_network'))
    expect(stored).toBe('mainnet')
  })

  test('corrupt localStorage value falls back to testnet', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('lob_network', 'devnet')
    })
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })

    // both buttons are always on screen, so their visibility proves nothing.
    // the selected one carries the raised pill classes, and that is the only
    // place the fallback shows up until something writes the value back.
    await expect(page.getByRole('button', { name: 'Testnet' })).toHaveClass(/bg-bg-card/)
    await expect(page.getByRole('button', { name: 'Mainnet' })).not.toHaveClass(/bg-bg-card/)
    // and the app really is reading testnet: the footer names the live network
    await expect(page.locator('footer')).toContainText('testnet')
  })

  test('mainnet on /positions shows the not-deployed notice', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('button', { name: 'Mainnet' }).click()
    await page.getByRole('link', { name: 'Positions', exact: true }).click()
    await expect(page.getByText(/not deployed/i).first()).toBeVisible()
  })
})

test.describe('Accessibility basics', () => {
  test('close-modal button has aria-label', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('button', { name: '+ Deposit' }).click()
    await expect(page.getByRole('button', { name: /Close deposit modal/i })).toBeVisible()
  })

  test('disconnect button has aria-label', async ({ page }) => {
    await gotoWithWallet(page)
    await expect(page.getByRole('button', { name: /Disconnect wallet/i })).toBeVisible()
  })

  test('every route has an h2 or h3 heading', async ({ page }) => {
    await gotoWithWallet(page)
    for (const path of ['/', '/performance', '/activity', '/allocation', '/bridges', '/positions']) {
      await page.goto(`${BASE}${path}`)
      await expect(page.locator('h2, h3').first()).toBeVisible()
    }
  })
})
