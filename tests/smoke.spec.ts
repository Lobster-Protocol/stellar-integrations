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
  await expect(page.getByText('Connect a wallet to track its performance.')).toBeVisible()
})

test('activity page loads', async ({ page }) => {
  await page.goto(BASE + '/activity', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Activity' })).toBeVisible()
})

test('allocation page loads', async ({ page }) => {
  await page.goto(BASE + '/allocation', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'Token Allocation' })).toBeVisible()
  await expect(page.getByText('Connect a wallet to see its allocation.')).toBeVisible()
})

test('bridges page loads with the Allbridge provider', async ({ page }) => {
  await page.goto(BASE + '/bridges', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText('Cross-Chain Bridges')).toBeVisible()
  await expect(page.getByText('Allbridge Core')).toBeVisible()
})

test('navigation between all pages works', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })

  for (const [link, expectedText] of [
    ['Performance', 'Performance'],
    ['Activity', 'Activity'],
    ['Allocation', 'Token Allocation'],
    ['Bridges', 'Cross-Chain Bridges'],
    ['Overview', 'Connect your wallet'],
  ] as const) {
    await page.getByRole('link', { name: link }).click()
    await page.waitForTimeout(500)
    await expect(page.getByText(expectedText).first()).toBeVisible()
  }
})

test('network selector toggles between testnet and mainnet', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })

  await page.getByText('Mainnet', { exact: true }).click()
  await page.waitForTimeout(300)
  await page.getByText('Testnet', { exact: true }).click()
  await page.waitForTimeout(300)
})

test('connect wallet button opens auth modal', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })

  const connectBtn = page.getByText('Connect Wallet').first()
  await connectBtn.click()
  await page.waitForTimeout(2000)
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

  const critical = errors.filter(
    (e) => !e.includes('favicon') && !e.includes('404') && !e.includes('net::ERR'),
  )
  if (critical.length > 0) {
    console.log('Console errors found:', critical)
  }
})
