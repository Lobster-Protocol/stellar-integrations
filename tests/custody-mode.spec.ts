import { test, expect } from '@playwright/test'

import { seedWallet } from './fixtures'

test.describe('Custody mode toggle', () => {
  test('defaults to wallet kit on a fresh browser', async ({ page }) => {
    await seedWallet(page)
    await page.goto('/audit', { waitUntil: 'domcontentloaded' })

    const walletKitCard = page.locator('button', { hasText: 'Wallet kit' })
    const dfnsCard = page.locator('button', { hasText: 'DFNS MPC' })
    await expect(walletKitCard).toBeVisible()
    await expect(dfnsCard).toBeVisible()
  })

  test('persists the chosen mode in localStorage', async ({ page }) => {
    await seedWallet(page)
    await page.goto('/audit', { waitUntil: 'domcontentloaded' })

    await page.locator('button', { hasText: 'DFNS MPC' }).click()
    const stored = await page.evaluate(() => localStorage.getItem('lob_custody_mode'))
    expect(stored).toBe('dfns')

    await page.locator('button', { hasText: 'Wallet kit' }).click()
    const stored2 = await page.evaluate(() => localStorage.getItem('lob_custody_mode'))
    expect(stored2).toBe('wallet-kit')
  })
})
