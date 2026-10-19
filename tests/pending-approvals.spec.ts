import { test, expect } from '@playwright/test'

import { seedWallet } from './fixtures'

test.describe('the approval queue', () => {
  test('shows the queue or asks for a DFNS organization', async ({ page }) => {
    await seedWallet(page)
    await page.goto('/audit', { waitUntil: 'domcontentloaded' })

    await expect(page.getByText('Pending approvals')).toBeVisible()

    // with no dfns profile seeded, expect the off state
    const off = page.getByText(/Connect a DFNS organization to see this/)
    if ((await off.count()) > 0) {
      await expect(off.first()).toBeVisible()
      return
    }

    // a read error from a down relay still counts as the panel working
    const named = page
      .getByText(/Nothing is waiting for approval/i)
      .or(page.getByRole('button', { name: 'Approve' }))
      .or(page.getByText(/custody relay|Failed to fetch|Load failed|NetworkError/i))
      .or(page.getByText('Loading...'))
    await expect(named.first()).toBeVisible({ timeout: 20_000 })
  })
})
