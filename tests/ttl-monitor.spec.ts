import { test, expect, type Page } from '@playwright/test'
import { gotoWithWallet } from './fixtures'

// the TTL countdown card is on /audit, under the custody panels, and reads its
// network from context. The daemon-side math is covered by the vitest unit;
// this checks the card renders and that it names the state it is in.
//
// These runs have no storage feed behind VITE_LOBSTER_API_URL (ci points it at
// a dead 127.0.0.1 on purpose), so the card lands in its unreachable state. It
// takes a few seconds to get there: a refused connection to localhost costs two
// on windows, and the query retries once before it gives up, so the waits below
// are longer than the five-second default.
test.describe('TTL countdown card', () => {
  const card = (page: Page) =>
    page.locator('div.card').filter({ hasText: 'Contract storage lease' }).first()

  test('renders the contract storage TTL card on /audit', async ({ page }) => {
    await gotoWithWallet(page, '/audit')
    await expect(page.getByRole('heading', { name: /Contract storage lease/ })).toBeVisible()
  })

  test('says the feed did not answer instead of printing a fetch error', async ({ page }) => {
    await gotoWithWallet(page, '/audit')
    await expect(card(page).getByText(/The storage feed did not answer/i)).toBeVisible({
      timeout: 20_000,
    })
    await expect(card(page).getByText(/Failed to fetch/i)).toHaveCount(0)
    await expect(card(page).getByRole('button', { name: 'Try again' })).toBeVisible()
  })

  test('drops the live badge when nothing was read', async ({ page }) => {
    await gotoWithWallet(page, '/audit')
    await expect(card(page).getByText(/The storage feed did not answer/i)).toBeVisible({
      timeout: 20_000,
    })
    await expect(card(page).getByText(/live \| on-chain/i)).toHaveCount(0)
  })
})
