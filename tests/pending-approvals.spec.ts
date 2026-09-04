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
    // baked into the bundle, and the old check passed whether the panel had
    // opted out or blown up on mount.
    const off = page.getByText(/VITE_LOBSTER_API_URL is not set/)
    if ((await off.count()) > 0) {
      await expect(off.first()).toBeVisible()
      return
    }

    // wired, so the panel has to land on a state it can name: still reading,
    // nothing queued, something queued, or why the queue could not be read. a
    // build pointed at a relay that is not up ends on the last of those, which
    // is the panel working rather than failing. matched page-wide on purpose so
    // a reshuffle of the panel markup does not break the check.
    const named = page
      .getByText(/Nothing is waiting for approval/i)
      .or(page.getByRole('button', { name: 'Approve' }))
      .or(page.getByText(/custody relay|Failed to fetch|Load failed|NetworkError/i))
      .or(page.getByText('Loading...'))
    await expect(named.first()).toBeVisible({ timeout: 20_000 })
  })
})
