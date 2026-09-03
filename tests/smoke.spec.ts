import { test, expect } from '@playwright/test'

import { BASE } from './fixtures'

test('homepage loads and shows sidebar', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.screenshot({ path: 'screenshots/01-overview.png', fullPage: true })

  const sidebar = page.locator('aside')
  await expect(sidebar).toBeVisible()

  const logo = page.locator('img[alt="Lobster"]').first()
  await expect(logo).toBeVisible()

  const connectBtn = page.getByRole('button', { name: 'Connect Wallet' }).first()
  await expect(connectBtn).toBeVisible()
})

test('overview shows the connect prompt when not connected', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Connect your wallet to get started')).toBeVisible()
})

test('performance page loads', async ({ page }) => {
  await page.goto(BASE + '/performance', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Performance' })).toBeVisible()
  // no wallet connected, so it asks to connect rather than showing numbers
  await expect(page.getByText(/Connect a wallet to rebuild its history/i)).toBeVisible()
})

test('activity page loads', async ({ page }) => {
  await page.goto(BASE + '/activity', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Activity', exact: true })).toBeVisible()
})

test('allocation page loads', async ({ page }) => {
  await page.goto(BASE + '/allocation', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Allocation', exact: true })).toBeVisible()
  await expect(page.getByText(/Connect a wallet to see how its value is spread/i)).toBeVisible()
})

test('bridges page loads with the Allbridge provider', async ({ page }) => {
  await page.goto(BASE + '/bridges', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Bridges', exact: true })).toBeVisible()
  await expect(page.getByText('Allbridge Core').first()).toBeVisible()
})

test('navigation between all pages works', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })

  for (const [link, expectedText] of [
    ['Performance', 'Performance'],
    ['Activity', 'Activity'],
    ['Allocation', 'Allocation'],
    ['Bridges', 'Allbridge Core'],
    ['Overview', 'Connect your wallet'],
  ] as const) {
    await page.getByRole('link', { name: link, exact: true }).click()
    await page.waitForTimeout(500)
    await expect(page.getByText(expectedText).first()).toBeVisible()
  }
})

test('network selector toggles between testnet and mainnet', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })

  const testnet = page.getByRole('button', { name: 'Testnet' })
  const mainnet = page.getByRole('button', { name: 'Mainnet' })

  // the toggle marks the live network with the raised pill classes, and writes
  // the choice through to storage, so check both ends of the switch
  await mainnet.click()
  await expect(mainnet).toHaveClass(/bg-bg-card/)
  await expect(testnet).not.toHaveClass(/bg-bg-card/)
  expect(await page.evaluate(() => localStorage.getItem('lob_network'))).toBe('mainnet')

  await testnet.click()
  await expect(testnet).toHaveClass(/bg-bg-card/)
  await expect(mainnet).not.toHaveClass(/bg-bg-card/)
  expect(await page.evaluate(() => localStorage.getItem('lob_network'))).toBe('testnet')
})

test('connect wallet button opens auth modal', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })

  await page.getByRole('button', { name: 'Connect Wallet' }).first().click()

  // the wallets kit appends its own section and lists what it can talk to.
  // clicking used to be followed by a screenshot and nothing else, so a kit
  // that never opened still read as a pass.
  const modal = page.locator('section.stellar-wallets-kit')
  await expect(modal).toBeVisible()
  await expect(modal.getByRole('heading', { name: 'Connect Wallet' })).toBeVisible()
  await expect(modal.getByText('Freighter', { exact: true })).toBeVisible()
  await expect(modal.getByText('xBull', { exact: true })).toBeVisible()

  await page.screenshot({ path: 'screenshots/06-wallet-modal.png', fullPage: true })
})

test('no critical console errors on any page', async ({ page }) => {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  for (const path of ['/', '/performance', '/activity', '/allocation', '/bridges']) {
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(500)
  }

  // three classes of browser noise are not the app misbehaving: a missing
  // favicon, a 404 from reading an account that is not on the ledger, and a
  // refused connection to a relay a test build is not expected to have. every
  // other console error is a real fault, and this used to only log them.
  const critical = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('404') && !e.includes('net::ERR'),
  )
  expect(critical, `unexpected console errors: ${critical.join(' / ')}`).toHaveLength(0)
})
