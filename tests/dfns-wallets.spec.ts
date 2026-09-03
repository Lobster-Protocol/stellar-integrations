import { test, expect } from '@playwright/test'

import { seedWallet } from './fixtures'

test.describe('DfnsWalletList on the audit page', () => {
  test('lists the custody wallets when the service is wired, and says so when it is not', async ({
    page,
  }) => {
    await seedWallet(page)
    await page.goto('/audit', { waitUntil: 'domcontentloaded' })

    await expect(page.getByText('DFNS wallets')).toBeVisible()

    // decided from the render, not from a node-side env var that says nothing
    // about whether the panel mounted. the write controls sit behind an
    // operator token this browser does not hold, so the count the live panel
    // always carries is what separates it from the off state.
    const count = page.getByText(/^\d+ total$/)
    const wired = (await count.count()) > 0

    if (wired) {
      await expect(count).toBeVisible()
      await expect(page.getByText(/VITE_LOBSTER_API_URL is not set/)).toHaveCount(0)
      return
    }

    await expect(page.getByText(/VITE_LOBSTER_API_URL is not set/).first()).toBeVisible()
  })
})
