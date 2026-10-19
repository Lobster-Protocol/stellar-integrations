import { test, expect } from '@playwright/test'

import { seedWallet } from './fixtures'

test.describe('the custody page', () => {
  test('renders the audit chrome with all the custody panels', async ({ page }) => {
    await seedWallet(page)
    await page.goto('/audit', { waitUntil: 'domcontentloaded' })

    // these render with or without a relay
    await expect(page.getByText('Institutional custody through DFNS')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'DFNS custody' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Signing activity/ })).toBeVisible()

    // only the off state prints this marker; count it once a panel title is up
    await expect(page.getByText('DFNS wallets')).toBeVisible()
    const off = page.getByText(/Connect a DFNS organization to see this/)
    const wired = (await off.count()) === 0

    await expect(page.getByText('Signing policies')).toBeVisible()
    await expect(page.getByText('Pending approvals')).toBeVisible()
    await expect(page.getByText('MiCA audit export')).toBeVisible()

    if (wired) {
      await expect(page.getByRole('button', { name: /Download JSON/i })).toBeVisible()
      await expect(page.getByText(/^\d+ total$/)).toBeVisible()
    } else {
      await expect(off.first()).toBeVisible()
      // the MiCA button shows either way. its sentence is what differs
      await expect(page.getByText(/no relay to ask for the records/i).first()).toBeVisible()
    }
  })

  test('MPC feed shows a waiting state until an event arrives', async ({ page }) => {
    await seedWallet(page)
    await page.goto('/audit', { waitUntil: 'domcontentloaded' })

    // the page loads lazily, so wait for a panel title before counting
    await expect(page.getByText('DFNS wallets')).toBeVisible()
    const off = page.getByText(/Connect a DFNS organization to see this/)
    if ((await off.count()) > 0) {
      // no relay, no event count
      await expect(page.getByRole('heading', { name: /Signing activity/ })).toBeVisible()
      await expect(page.getByText('0 events')).toHaveCount(0)
      return
    }

    // nothing was signed in this browser. check the count, not the empty-state copy
    await expect(page.getByText('0 events')).toBeVisible()
    await expect(page.getByRole('heading', { name: /Signing activity/ })).toBeVisible()
  })
})
