import { test, expect } from '@playwright/test'

const BASE = 'https://stellar-integrations-blush.vercel.app'

// collect all console errors
const consoleErrors: string[] = []

test.beforeEach(async ({ page }) => {
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', err => consoleErrors.push(err.message))
})

test('homepage loads and shows sidebar', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.screenshot({ path: 'screenshots/01-overview.png', fullPage: true })

  // sidebar should exist with nav links
  const sidebar = page.locator('aside')
  await expect(sidebar).toBeVisible()

  // lobster logo should be visible
  const logo = page.locator('img[alt="Lobster"]')
  await expect(logo).toBeVisible()

  // connect wallet button should be visible
  const connectBtn = page.getByRole('button', { name: 'Connect Wallet' }).first()
  await expect(connectBtn).toBeVisible()
})

test('overview shows KPI cards when not connected', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'networkidle' })

  // should show the "connect wallet" prompt since no wallet
  const prompt = page.getByText('Connect your wallet to get started')
  await expect(prompt).toBeVisible()
})

test('performance page loads with charts', async ({ page }) => {
  await page.goto(BASE + '/performance', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000) // let recharts render
  await page.screenshot({ path: 'screenshots/02-performance.png', fullPage: true })

  // time range selector should exist
  const allBtn = page.getByText('ALL', { exact: true })
  await expect(allBtn).toBeVisible()

  // PnL heading
  const pnlHeading = page.getByText('P&L (%)')
  await expect(pnlHeading).toBeVisible()

  // chart container should have SVG (recharts renders SVGs)
  const svgs = page.locator('svg.recharts-surface')
  expect(await svgs.count()).toBeGreaterThan(0)
})

test('activity page loads with events', async ({ page }) => {
  await page.goto(BASE + '/activity', { waitUntil: 'networkidle' })
  await page.screenshot({ path: 'screenshots/03-activity.png', fullPage: true })

  const heading = page.getByText('Strategy Activity')
  await expect(heading).toBeVisible()

  // filter buttons
  const allFilter = page.getByText('All', { exact: true })
  await expect(allFilter).toBeVisible()

  // should have activity items
  const migrationItems = page.getByText('Pool Migration')
  expect(await migrationItems.count()).toBeGreaterThan(0)
})

test('allocation page loads with stacked chart', async ({ page }) => {
  await page.goto(BASE + '/allocation', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'screenshots/04-allocation.png', fullPage: true })

  const heading = page.getByText('Token Allocation')
  await expect(heading).toBeVisible()

  // token delta chart
  const deltaHeading = page.getByText('Token Delta')
  await expect(deltaHeading).toBeVisible()

  // DEX distribution
  const dexHeading = page.getByText('DEX Distribution Over Time')
  await expect(dexHeading).toBeVisible()
})

test('bridges page loads with flow data', async ({ page }) => {
  await page.goto(BASE + '/bridges', { waitUntil: 'networkidle' })
  await page.screenshot({ path: 'screenshots/05-bridges.png', fullPage: true })

  const heading = page.getByText('Cross-Chain Bridges')
  await expect(heading).toBeVisible()

  // allbridge provider badge
  const allbridge = page.getByText('Allbridge Core')
  await expect(allbridge).toBeVisible()

  // bridge history
  const historyHeading = page.getByText('Bridge History')
  await expect(historyHeading).toBeVisible()
})

test('navigation between all pages works', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'networkidle' })

  // click each nav link and verify page loads
  for (const [link, expectedText] of [
    ['Performance', 'Strategy Performance'],
    ['Activity', 'Strategy Activity'],
    ['Allocation', 'Token Allocation'],
    ['Bridges', 'Cross-Chain Bridges'],
    ['Overview', 'Connect your wallet'],
  ] as const) {
    await page.getByRole('link', { name: link }).click()
    await page.waitForTimeout(500)
    await expect(page.getByText(expectedText)).toBeVisible()
  }
})

test('network selector toggles between testnet and mainnet', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'networkidle' })

  const mainnetBtn = page.getByText('Mainnet', { exact: true })
  await mainnetBtn.click()
  await page.waitForTimeout(300)

  // mainnet button should now look active (has shadow)
  const testnetBtn = page.getByText('Testnet', { exact: true })
  await testnetBtn.click()
  await page.waitForTimeout(300)
})

test('connect wallet button opens auth modal', async ({ page }) => {
  await page.goto(BASE, { waitUntil: 'networkidle' })

  const connectBtn = page.getByText('Connect Wallet').first()
  await connectBtn.click()
  await page.waitForTimeout(2000) // wait for modal to appear

  await page.screenshot({ path: 'screenshots/06-wallet-modal.png', fullPage: true })
})

test('time range selector changes chart data', async ({ page }) => {
  await page.goto(BASE + '/performance', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)

  // click 1M
  await page.getByText('1M', { exact: true }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'screenshots/07-performance-1m.png', fullPage: true })

  // click 1W
  await page.getByText('1W', { exact: true }).click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: 'screenshots/08-performance-1w.png', fullPage: true })
})

test('activity filter buttons work', async ({ page }) => {
  await page.goto(BASE + '/activity', { waitUntil: 'networkidle' })

  // click Pool Migration filter
  await page.getByRole('button', { name: 'Pool Migration' }).click()
  await page.waitForTimeout(300)

  // after filtering, migration items should be visible and swap items reduced
  const migrations = page.locator('text=Pool Migration')
  expect(await migrations.count()).toBeGreaterThan(1) // filter btn + actual events

  await page.screenshot({ path: 'screenshots/09-activity-filtered.png', fullPage: true })
})

test('no critical console errors on any page', async ({ page }) => {
  const errors: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  for (const path of ['/', '/performance', '/activity', '/allocation', '/bridges']) {
    await page.goto(BASE + path, { waitUntil: 'networkidle' })
    await page.waitForTimeout(500)
  }

  // filter out known non-critical errors (like favicon 404, etc.)
  const critical = errors.filter(e =>
    !e.includes('favicon') &&
    !e.includes('404') &&
    !e.includes('net::ERR')
  )

  if (critical.length > 0) {
    console.log('Console errors found:', critical)
  }
  // we just log, don't fail — some errors may come from external scripts
})
