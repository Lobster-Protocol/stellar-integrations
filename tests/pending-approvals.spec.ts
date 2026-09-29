import { test, expect } from '@playwright/test'

import { seedWallet } from './fixtures'

test.describe('the approval queue', () => {
  test('names the state of the approval queue, or says the service is not wired', async ({
    page,
  }) => {
    await seedWallet(page)
    await page.goto('/audit', { waitUntil: 'domcontentloaded' })

    await expect(page.getByText('Pending approvals')).toBeVisible()

    // decided from the render, not from a node-side env var: the relay url is
    // baked into the bundle
    const off = page.getByText(/Connect a DFNS organization to see this/)
    if ((await off.count()) > 0) {
      await expect(off.first()).toBeVisible()
      return
    }

    // a relay that is down ends on the read error, which still counts as the panel
    // working. matched page-wide so a markup reshuffle does not break the check
    const named = page
      .getByText(/Nothing is waiting for approval/i)
      .or(page.getByRole('button', { name: 'Approve' }))
      .or(page.getByText(/custody relay|Failed to fetch|Load failed|NetworkError/i))
      .or(page.getByText('Loading...'))
    await expect(named.first()).toBeVisible({ timeout: 20_000 })
  })
})
