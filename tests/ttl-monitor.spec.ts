import { test, expect } from '@playwright/test'
import { gotoWithWallet } from './fixtures'

// the TTL countdown card is on /positions and reads its network from context.
// The daemon-side math is covered by the vitest unit; this checks the card
// actually renders in the dashboard. No backend needed: the card shows its
// shell and an empty state when the bff isn't configured.
test.describe('TTL countdown card', () => {
  test('renders the contract storage TTL card on /positions', async ({ page }) => {
    await gotoWithWallet(page, '/positions')
    await expect(page.getByRole('heading', { name: /Contract storage lease/ })).toBeVisible()
  })

  test('labels the source as live Soroban RPC on the active network', async ({ page }) => {
    await gotoWithWallet(page, '/positions')
    await expect(page.getByText(/live \| on-chain \| testnet/i)).toBeVisible()
  })
})
