import { test, expect } from '@playwright/test'

import { gotoWithWallet } from './fixtures'

// Native Stellar multisig ("shared control") is no longer something you set up:
// multisig is DFNS custody only now. The Custody page must not offer to turn a
// native quorum on, and the old standalone co-sign card is gone. What remains is
// a revert path that only shows for an account that already carries a quorum,
// which a single-sig E2E wallet does not, so nothing shared-control renders here.

test.describe('shared control (native multisig removed)', () => {
  test('the custody page no longer offers to set up a native multisig', async ({ page }) => {
    await gotoWithWallet(page, '/audit')
    await expect(page).toHaveURL(/\/audit$/)
    await expect(page.getByText('Turn on shared control')).toHaveCount(0)
    await expect(page.getByPlaceholder('Paste the transaction here')).toHaveCount(0)
  })

  test('the old /shared-control link redirects into custody', async ({ page }) => {
    await gotoWithWallet(page, '/shared-control')
    await expect(page).toHaveURL(/\/audit$/)
  })
})
