import { test, expect } from '@playwright/test'

import { gotoWithWallet } from './fixtures'

// Native Stellar multisig ("shared control") is not something you set up here:
// multisig is DFNS custody. The Custody page must not offer to turn a native
// quorum on, and there is no standalone co-sign card. The one path left is a
// revert that only shows for an account that already carries a quorum, which a
// single-sig E2E wallet does not, so nothing shared-control renders here.

test.describe('shared control', () => {
  test('the custody page does not offer to set up a native multisig', async ({ page }) => {
    await gotoWithWallet(page, '/audit')
    await expect(page).toHaveURL(/\/audit$/)
    await expect(page.getByText('Turn on shared control')).toHaveCount(0)
    await expect(page.getByPlaceholder('Paste the transaction here')).toHaveCount(0)
  })

  test('the /shared-control link redirects into custody', async ({ page }) => {
    await gotoWithWallet(page, '/shared-control')
    await expect(page).toHaveURL(/\/audit$/)
  })
})
