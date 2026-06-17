import { test, expect } from '@playwright/test'

import { seedWallet } from './fixtures'

// vite inlines VITE_* at build, so we read the same env on the node side
// to decide what the page should be showing.
const apiUrl = process.env.VITE_LOBSTER_API_URL

test.describe('MicaExportButton on the audit page', () => {
  test('renders only when the lobster api url is configured', async ({ page }) => {
    await seedWallet(page)
    await page.goto('/audit', { waitUntil: 'domcontentloaded' })

    const card = page.getByText('MiCA audit export')
    if (apiUrl) {
      await expect(card).toBeVisible()
      await expect(page.getByRole('button', { name: /Download JSON/i })).toBeVisible()
    } else {
      await expect(card).toHaveCount(0)
    }
  })
})
