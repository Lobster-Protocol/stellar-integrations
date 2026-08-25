import { readFile } from 'node:fs/promises'

import { test, expect, type Download, type Locator, type Page } from '@playwright/test'

import { gotoWithWallet, TEST_WALLET } from './fixtures'

// runs against live testnet horizon, like the other on-chain specs
const DAY = '\\d{4}-\\d{2}-\\d{2}'
const ACCOUNT = TEST_WALLET.address.slice(0, 6)
const BOM = '\ufeff'

async function text(download: Download): Promise<string> {
  const path = await download.path()
  return readFile(path, 'utf8')
}

function rows(csv: string): string[] {
  return csv.replace(BOM, '').trimEnd().split('\r\n')
}

async function tabCount(tab: Locator): Promise<number> {
  return Number((await tab.innerText()).replace(/\D/g, ''))
}

test.describe('history export', () => {
  test('downloads the account history as a spreadsheet', async ({ page }) => {
    await gotoWithWallet(page, '/activity')
    await expect(page.getByRole('heading', { name: 'Activity', exact: true })).toBeVisible()

    // the tab counts what the feed holds, so it is the floor the file must clear
    const tab = page.getByRole('button', { name: /^Everything \d+$/ })
    await expect(tab).toBeVisible({ timeout: 20000 })
    const onScreen = await tabCount(tab)
    expect(onScreen).toBeGreaterThan(0)

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'CSV' }).click(),
    ])

    expect(download.suggestedFilename()).toMatch(
      new RegExp(`^lobster-activity-${ACCOUNT}-testnet-${DAY}\\.csv$`),
    )

    const csv = await text(download)
    expect(csv.startsWith(BOM)).toBe(true)

    const lines = rows(csv)
    expect(lines[0]).toContain('Timestamp (UTC)')
    expect(lines[0]).toContain('Transaction')
    expect(lines[0]).toContain('Explorer')
    expect(lines.length - 1).toBeGreaterThanOrEqual(onScreen)

    // the status line has to say how far back the file goes
    await expect(page.getByText(/\d+ operations, back to the first one\./)).toBeVisible()
  })

  test('downloads the same history as JSON, with its own provenance', async ({ page }) => {
    await gotoWithWallet(page, '/activity')
    await expect(page.getByRole('heading', { name: 'Activity', exact: true })).toBeVisible()

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'JSON' }).click(),
    ])

    const parsed = JSON.parse(await text(download))
    expect(parsed.account).toBe(TEST_WALLET.address)
    expect(parsed.network).toBe('testnet')
    expect(parsed.complete).toBe(true)
    expect(Array.isArray(parsed.events)).toBe(true)
    expect(parsed.events.length).toBe(parsed.operations)
    expect(parsed.events[0]).toHaveProperty('txHash')
    expect(parsed.events[0]).toHaveProperty('kind')
  })

  test('downloads what the wallet holds from the allocation page', async ({ page }) => {
    await gotoWithWallet(page, '/allocation')
    await expect(page.getByRole('heading', { name: 'Allocation', exact: true })).toBeVisible()

    const button = page.getByRole('button', { name: 'CSV' })
    await expect(button).toBeEnabled({ timeout: 20000 })

    const [download] = await Promise.all([page.waitForEvent('download'), button.click()])
    expect(download.suggestedFilename()).toMatch(
      new RegExp(`^lobster-holdings-${ACCOUNT}-testnet-${DAY}\\.csv$`),
    )

    const lines = rows(await text(download))
    expect(lines[0]).toContain('Location')
    expect(lines[0]).toContain('Share of portfolio')
    expect(lines.length).toBeGreaterThan(1)
  })
})

test.describe('activity search', () => {
  test('puts the search in the address bar so the view can be shared', async ({ page }) => {
    await gotoWithWallet(page, '/activity')
    await expect(page.getByRole('button', { name: /^Everything \d+$/ })).toBeVisible({
      timeout: 20000,
    })

    const box = page.getByRole('searchbox', { name: /Search this account/ })
    await box.fill('zznothinghere')
    await expect(page).toHaveURL(/q=zznothinghere/)
    await expect(page.getByRole('button', { name: 'Clear the search' })).toBeVisible()

    // a reload rebuilds the same filtered view from the url alone
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('searchbox', { name: /Search this account/ })).toHaveValue(
      'zznothinghere',
    )

    await page.getByRole('button', { name: 'Clear the search' }).click()
    await expect(page).not.toHaveURL(/q=/)
  })

  test('narrows the feed to rows that hold the text', async ({ page }) => {
    await gotoWithWallet(page, '/activity')
    const tab = page.getByRole('button', { name: /^Everything \d+$/ })
    await expect(tab).toBeVisible({ timeout: 20000 })
    const before = await tabCount(tab)
    expect(before).toBeGreaterThan(0)

    await page.getByRole('searchbox', { name: /Search this account/ }).fill('storage rent')
    await expect.poll(() => tabCount(tab)).toBeLessThan(before)
  })
})

test.describe('activity date range', () => {
  const START = (p: Page) => p.getByLabel('Start date, UTC')
  const END = (p: Page) => p.getByLabel('End date, UTC')

  test('a window that holds nothing shows nothing, and downloads nothing', async ({ page }) => {
    await gotoWithWallet(page, '/activity')
    const tab = page.getByRole('button', { name: /^Everything \d+$/ })
    await expect(tab).toBeVisible({ timeout: 20000 })

    await START(page).fill('2099-01-01')
    await END(page).fill('2099-12-31')
    await expect(page).toHaveURL(/from=2099-01-01/)
    await expect.poll(() => tabCount(tab)).toBe(0)
    await expect(
      page.getByText('Nothing on this account matches what you asked for.').first(),
    ).toBeVisible()

    // the file has to agree with the screen, header and no rows
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'CSV' }).click(),
    ])
    expect(rows(await text(download))).toHaveLength(1)
    await expect(page.getByText(/^0 operations between/)).toBeVisible()
  })

  test('a window wider than the account keeps every operation', async ({ page }) => {
    await gotoWithWallet(page, '/activity')
    const tab = page.getByRole('button', { name: /^Everything \d+$/ })
    await expect(tab).toBeVisible({ timeout: 20000 })
    const all = await tabCount(tab)

    // the same file, once unbounded and once inside a window that predates the
    // account, has to come out the same length
    const [whole] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'CSV' }).click(),
    ])
    const wholeRows = rows(await text(whole)).length

    await START(page).fill('2000-01-01')
    await expect(page).toHaveURL(/from=2000-01-01/)
    await expect.poll(() => tabCount(tab)).toBe(all)

    const [windowed] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'CSV' }).click(),
    ])
    expect(windowed.suggestedFilename()).toMatch(
      new RegExp(`^lobster-activity-2000-01-01-to-now-${ACCOUNT}-testnet-${DAY}[.]csv$`),
    )
    expect(rows(await text(windowed))).toHaveLength(wholeRows)
    await expect(page.getByText(/operations since 1 Jan 2000 \(UTC\)\./)).toBeVisible()
  })

  test('refuses a window whose end comes before its start', async ({ page }) => {
    await gotoWithWallet(page, '/activity')
    await expect(page.getByRole('button', { name: /^Everything \d+$/ })).toBeVisible({
      timeout: 20000,
    })

    await page.goto('/activity?from=2026-06-30&to=2026-06-01', { waitUntil: 'domcontentloaded' })
    await expect(
      page.getByText('The end date is before the start date, so nothing can fall inside it.'),
    ).toBeVisible({ timeout: 20000 })
    await expect(page.getByRole('button', { name: 'CSV' })).toBeDisabled()

    await page.getByRole('button', { name: 'Reset the dates' }).click()
    await expect(page).not.toHaveURL(/from=/)
  })

  test('ignores a date the url carries that nothing can parse', async ({ page }) => {
    await gotoWithWallet(page, '/activity')
    const tab = page.getByRole('button', { name: /^Everything \d+$/ })
    await expect(tab).toBeVisible({ timeout: 20000 })
    const all = await tabCount(tab)

    await page.goto('/activity?from=2026-13-45', { waitUntil: 'domcontentloaded' })
    await expect(tab).toBeVisible({ timeout: 20000 })
    // a bound nothing can read must not silently pass every row through
    await expect.poll(() => tabCount(tab)).toBe(all)
    await expect(page.getByText('Full history')).toBeVisible()
    await expect(START(page)).toHaveValue('')
  })

  test('carries the window through a reload', async ({ page }) => {
    await gotoWithWallet(page, '/activity?from=2026-06-01&to=2026-06-30')
    await expect(page.getByText('Selected dates')).toBeVisible({ timeout: 20000 })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(START(page)).toHaveValue('2026-06-01')
    await expect(END(page)).toHaveValue('2026-06-30')
  })
})
