import { test, expect } from '@playwright/test'

import { seedWallet } from './fixtures'

const apiUrl = process.env.VITE_LOBSTER_API_URL

test.describe('DfnsWalletList on the audit page', () => {
  test('shows the wallet list panel when the api url is configured', async ({ page }) => {
    await seedWallet(page)
    await page.goto('/audit', { waitUntil: 'domcontentloaded' })

    if (!apiUrl) {
      await expect(page.getByText('DFNS wallets')).toHaveCount(0)
      return
    }

    await expect(page.getByText('DFNS wallets')).toBeVisible()
    await expect(page.getByPlaceholder(/name \((Stellar|StellarTestnet)\)/i)).toBeVisible()
    await expect(page.getByRole('button', { name: 'New wallet' })).toBeVisible()
  })
})
