import { test, expect } from '@playwright/test'

import { seedWallet } from './fixtures'

test.describe('the custody wallet list', () => {
  test('lists the wallets or asks for a DFNS organization', async ({ page }) => {
    await seedWallet(page)
    await page.goto('/audit', { waitUntil: 'domcontentloaded' })

    await expect(page.getByText('DFNS wallets')).toBeVisible()

    // this spec seeds no dfns profile, and without one the panel shows its off state
    const count = page.getByText(/^\d+ total$/)
    const wired = (await count.count()) > 0

    if (wired) {
      await expect(count).toBeVisible()
      await expect(page.getByText(/Connect a DFNS organization to see this/)).toHaveCount(0)
      return
    }

    await expect(page.getByText(/Connect a DFNS organization to see this/).first()).toBeVisible()
  })
})
