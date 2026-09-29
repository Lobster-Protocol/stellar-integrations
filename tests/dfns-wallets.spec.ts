import { test, expect } from '@playwright/test'

import { seedWallet } from './fixtures'

test.describe('the custody wallet list', () => {
  test('lists the custody wallets when the service is wired, and says so when it is not', async ({
    page,
  }) => {
    await seedWallet(page)
    await page.goto('/audit', { waitUntil: 'domcontentloaded' })

    await expect(page.getByText('DFNS wallets')).toBeVisible()

    // decided from the render, since the relay url is baked into the bundle. the
    // write controls need an operator token this browser lacks, so go by the count
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
