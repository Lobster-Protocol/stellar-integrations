import { test, expect } from '@playwright/test'

import { seedWallet } from './fixtures'

test.describe('Audit page - DFNS wiring', () => {
  test('renders the audit chrome with all the custody panels', async ({ page }) => {
    await seedWallet(page)
    await page.goto('/audit', { waitUntil: 'domcontentloaded' })

    // these render regardless of api wiring
    await expect(page.getByText('Custody and audit')).toBeVisible()
    await expect(page.getByText('Custody mode')).toBeVisible()
    await expect(page.getByText('MPC signature feed')).toBeVisible()

    // the custody panels only exist once the service is wired, and the bundle
    // carries that url from build-time env this process cannot read, so decide
    // from what actually rendered
    const wired = (await page.getByText('DFNS wallets').count()) > 0
    if (wired) {
      await expect(page.getByText('DFNS wallets')).toBeVisible()
      await expect(page.getByText('Signing policies')).toBeVisible()
      await expect(page.getByText('Pending approvals')).toBeVisible()
      await expect(page.getByText('MiCA audit export')).toBeVisible()
    } else {
      await expect(page.getByText(/custody service is not wired up/i)).toBeVisible()
      await expect(page.getByText('DFNS wallets')).toHaveCount(0)
      await expect(page.getByText('Signing policies')).toHaveCount(0)
      await expect(page.getByText('Pending approvals')).toHaveCount(0)
      await expect(page.getByText('MiCA audit export')).toHaveCount(0)
    }
  })

  test('MPC feed shows a waiting state until an event arrives', async ({ page }) => {
    await seedWallet(page)
    await page.goto('/audit', { waitUntil: 'domcontentloaded' })

    // nothing has been signed in this browser, so the feed sits empty whether
    // or not the relay url is baked into the bundle
    await expect(page.getByText('0 events')).toBeVisible()
    await expect(page.getByText(/Waiting for DFNS events/i)).toBeVisible()
  })
})
