import { test, expect } from '@playwright/test'

import { seedWallet } from './fixtures'

test.describe('the MiCA export control', () => {
  test('offers the export when the custody service is wired, and says so when it is not', async ({
    page,
  }) => {
    await seedWallet(page)
    await page.goto('/audit', { waitUntil: 'domcontentloaded' })

    // the panel names itself either way, so the title is the one thing to hold
    // it to unconditionally
    await expect(page.getByText('MiCA audit export')).toBeVisible()

    // vite inlines the relay url at build time and this process cannot read the
    // bundle's copy, so decide from what rendered. reading the node-side env
    // instead let an absent panel pass as "correctly absent" even when the
    // component had been deleted or had thrown on mount.
    const download = page.getByRole('button', { name: /Download JSON/i })
    const wired = (await download.count()) > 0

    if (wired) {
      await expect(download).toBeVisible()
      // and no panel is claiming the relay url is missing while the export works
      await expect(page.getByText(/VITE_LOBSTER_API_URL is not set/)).toHaveCount(0)
      return
    }

    // no export control only counts when the panel owns the gap and names the
    // setting it is missing
    await expect(page.getByText(/VITE_LOBSTER_API_URL is not set/).first()).toBeVisible()
  })
})
