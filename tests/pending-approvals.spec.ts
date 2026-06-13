import { test, expect } from '@playwright/test'

import { seedWallet } from './fixtures'

const apiUrl = process.env.VITE_LOBSTER_API_URL

test.describe('PendingApprovalsPanel on the audit page', () => {
  test('shows the empty state when no approvals are pending', async ({ page }) => {
    await seedWallet(page)
    await page.goto('/audit', { waitUntil: 'networkidle' })

    if (!apiUrl) {
      await expect(page.getByText('Pending approvals')).toHaveCount(0)
      return
    }

    await expect(page.getByText('Pending approvals')).toBeVisible()
    // either "Loading..." then "No approvals waiting" or directly the empty state
    const loading = page.getByText(/Loading/i)
    const empty = page.getByText(/No approvals waiting/i)
    await expect(loading.or(empty).first()).toBeVisible({ timeout: 5_000 })
  })
})
