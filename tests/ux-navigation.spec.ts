import { test, expect, type Page } from '@playwright/test'

import { gotoWithWallet, BASE } from './fixtures'

async function gotoNoWallet(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
}

test.describe('Cross-page navigation', () => {
  test('opens on the portfolio', async ({ page }) => {
    await gotoWithWallet(page)
    await expect(page.getByText('Portfolio').first()).toBeVisible()
  })

  test('performance comes back with a plotted series', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('link', { name: /Performance/ }).click()
    await expect(page).toHaveURL(/\/performance$/)
    // the card frame renders either way; only the plotted series shows the history came back
    await expect(page.getByRole('heading', { name: 'Wallet balance over time' })).toBeVisible()
    await expect(page.locator('.recharts-area-curve').first()).toBeVisible({ timeout: 25_000 })
  })

  test('activity answers under its own heading after a sidebar click', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('link', { name: /^Activity$/ }).click()
    await expect(page).toHaveURL(/\/activity$/)
    await expect(page.getByRole('heading', { name: 'Activity', exact: true })).toBeVisible()
  })

  test('allocation is a real route, not a tab that leaves the url alone', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('link', { name: /Allocation/ }).click()
    await expect(page).toHaveURL(/\/allocation$/)
  })

  test('the bridges tile names who carries the USDC across', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('link', { name: /^Bridges$/ }).click()
    await expect(page).toHaveURL(/\/bridges$/)
    // anchored on the tile so a stray mention of the name elsewhere cannot stand in for it
    const provider = page
      .getByText('Carried by', { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]')
    await expect(provider).toContainText('Circle CCTP')
  })

  test('positions is reachable from the sidebar', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('link', { name: 'Positions', exact: true }).click()
    await expect(page).toHaveURL(/\/positions$/)
    await expect(page.getByRole('heading', { name: 'Positions' })).toBeVisible()
  })

  test('custody is reachable and offers no native multisig setup', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('link', { name: 'Custody', exact: true }).click()
    await expect(page).toHaveURL(/\/audit$/)
    await expect(page.getByText('Turn on shared control')).toHaveCount(0)
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

  test('the sidebar marks the page you are actually on', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('link', { name: /Performance/ }).click()
    const active = page.getByRole('link', { name: /Performance/ })
    await expect(active).toHaveClass(/bg-primary/)
  })
})

test.describe('Mobile responsiveness', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('hides the sidebar at phone width', async ({ page }) => {
    await gotoNoWallet(page)
    await expect(page.locator('aside').first()).toBeHidden()
  })

  test('the drawer carries every nav item, not a subset', async ({ page }) => {
    await gotoNoWallet(page)
    const hamburger = page.getByRole('button', { name: /Open menu/i })
    await hamburger.click()
    for (const label of ['Overview', 'Performance', 'Activity', 'Allocation', 'Bridges', 'Positions', 'Custody']) {
      await expect(page.getByRole('link', { name: new RegExp(`^${label}$`) }).first()).toBeVisible()
    }
  })

  test('leaves a way to connect on a phone', async ({ page }) => {
    await gotoNoWallet(page)
    // the top bar and the Overview empty state each render one
    await expect(page.getByRole('button', { name: /Connect Wallet/ }).first()).toBeVisible()
  })
})

test.describe('Network toggle', () => {
  test('offers both networks in the top bar', async ({ page }) => {
    await gotoWithWallet(page)
    await expect(page.getByRole('button', { name: 'Testnet' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Mainnet' })).toBeVisible()
  })

  test('remembers mainnet once it is picked', async ({ page }) => {
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

    // both buttons are always visible; until something writes the value back, the
    // raised pill class on the selected one is the only place the fallback shows
    await expect(page.getByRole('button', { name: 'Testnet' })).toHaveClass(/bg-bg-card/)
    await expect(page.getByRole('button', { name: 'Mainnet' })).not.toHaveClass(/bg-bg-card/)
    // the footer names the network the app is actually reading
    await expect(page.locator('footer')).toContainText('testnet')
  })

  test('positions on mainnet offers a vault like testnet does', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('button', { name: 'Mainnet' }).click()
    await page.getByRole('link', { name: 'Positions', exact: true }).click()
    await expect(page.getByRole('button', { name: /^\+ Create vault$/ })).toBeVisible({ timeout: 25000 })
    await expect(page.getByText(/not deployed/i)).toHaveCount(0)
  })
})

test.describe('controls that are icons still have names', () => {
  test('the bridge close button says what it closes', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('button', { name: '+ Deposit' }).click()
    await expect(page.getByRole('button', { name: 'Close bridge' })).toBeVisible()
  })

  test('the disconnect control names itself', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('button', { name: 'Connected wallet' }).click()
    await expect(page.getByRole('menuitem', { name: /Disconnect/i })).toBeVisible()
  })

  test('no route lands without a heading to jump to', async ({ page }) => {
    await gotoWithWallet(page)
    for (const path of ['/', '/performance', '/activity', '/allocation', '/bridges', '/positions']) {
      await page.goto(`${BASE}${path}`)
      await expect(page.locator('h2, h3').first()).toBeVisible()
    }
  })
})
