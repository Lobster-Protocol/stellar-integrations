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

    // the export control renders in both states now: the panel keeps its button
    // and explains underneath when it has no relay to ask. so the button is no
    // longer the discriminator, the panel's own sentence is.
    await expect(page.getByRole('button', { name: /Download JSON/i })).toBeVisible()

    const noProfile = page.getByText(/no relay to ask for the records/i)
    if ((await noProfile.count()) > 0) {
      await expect(noProfile.first()).toBeVisible()
      return
    }

    // wired: the sibling panels are reading the same relay, so none of them is
    // still asking to be connected
    await expect(page.getByText(/Connect a DFNS organization to see this/)).toHaveCount(0)
  })
})
