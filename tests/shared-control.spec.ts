import { test, expect } from '@playwright/test'

import { gotoWithWallet } from './fixtures'

// multisig goes through DFNS. the native revert only shows to an account with a quorum

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
