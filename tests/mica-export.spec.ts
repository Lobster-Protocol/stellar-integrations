import { test, expect } from '@playwright/test'

import { seedWallet } from './fixtures'

test.describe('the MiCA export control', () => {
  test('offers the export or says no DFNS profile is selected', async ({ page }) => {
    await seedWallet(page)
    await page.goto('/audit', { waitUntil: 'domcontentloaded' })

    await expect(page.getByText('MiCA audit export')).toBeVisible()

    // the button shows in both states; the sentence under it tells them apart
    await expect(page.getByRole('button', { name: /Download JSON/i })).toBeVisible()

    const noProfile = page.getByText(/no relay to ask for the records/i)
    if ((await noProfile.count()) > 0) {
      await expect(noProfile.first()).toBeVisible()
      return
    }

    // relay on, so no sibling panel asks to be connected
    await expect(page.getByText(/Connect a DFNS organization to see this/)).toHaveCount(0)
  })
})
