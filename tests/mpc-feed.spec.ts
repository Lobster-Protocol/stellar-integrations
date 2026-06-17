import { test, expect } from '@playwright/test'

import { seedWallet } from './fixtures'

const apiUrl = process.env.VITE_LOBSTER_API_URL

test.describe('Audit page - DFNS wiring', () => {
  test('renders the audit chrome with all the D4 panels', async ({ page }) => {
    await seedWallet(page)
    await page.goto('/audit', { waitUntil: 'domcontentloaded' })

    // these render regardless of api wiring; PoliciesPanel still shows a
    // header + a hint to set VITE_LOBSTER_API_URL when missing.
    await expect(page.getByText('Custody and audit')).toBeVisible()
    await expect(page.getByText('Custody mode')).toBeVisible()
    await expect(page.getByText('MPC signature feed')).toBeVisible()
    await expect(page.getByText('MPC policies & wallets')).toBeVisible()

    // these three silently null out when no api url is set
    if (apiUrl) {
      await expect(page.getByText('DFNS wallets')).toBeVisible()
      await expect(page.getByText('Pending approvals')).toBeVisible()
      await expect(page.getByText('MiCA audit export')).toBeVisible()
    } else {
      await expect(page.getByText('DFNS wallets')).toHaveCount(0)
      await expect(page.getByText('Pending approvals')).toHaveCount(0)
      await expect(page.getByText('MiCA audit export')).toHaveCount(0)
    }
  })

  test('MPC feed shows a waiting state when no SSE url is set', async ({ page }) => {
    test.skip(Boolean(apiUrl), 'feed goes live once the build has an api url')
    await seedWallet(page)
    await page.goto('/audit', { waitUntil: 'domcontentloaded' })

    await expect(page.getByText('0 events')).toBeVisible()
    await expect(page.getByText(/Waiting for DFNS events/i)).toBeVisible()
  })
})
