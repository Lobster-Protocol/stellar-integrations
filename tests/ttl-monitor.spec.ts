import { test, expect, type Page } from '@playwright/test'
import { gotoWithWallet } from './fixtures'

// the relay answers in prod, so the dead feed is made here: every /ttl read gets cut.
// the query still retries once before the card gives up
test.describe('TTL countdown card', () => {
  const card = (page: Page) =>
    page.locator('div.card').filter({ hasText: 'Contract storage lease' }).first()
  const cutFeed = (page: Page) => page.route(/\/ttl\?network=/, (r) => r.abort())

  test('renders the contract storage TTL card on /audit', async ({ page }) => {
    await gotoWithWallet(page, '/audit')
    await expect(page.getByRole('heading', { name: /Contract storage lease/ })).toBeVisible({ timeout: 20_000 })
  })

  test('says the feed did not answer instead of printing a fetch error', async ({ page }) => {
    await cutFeed(page)
    await gotoWithWallet(page, '/audit')
    await expect(card(page).getByText(/The storage feed did not answer/i)).toBeVisible({
      timeout: 20_000,
    })
    await expect(card(page).getByText(/Failed to fetch/i)).toHaveCount(0)
    await expect(card(page).getByRole('button', { name: 'Try again' })).toBeVisible()
  })

  test('drops the live badge when nothing was read', async ({ page }) => {
    await cutFeed(page)
    await gotoWithWallet(page, '/audit')
    await expect(card(page).getByText(/The storage feed did not answer/i)).toBeVisible({
      timeout: 20_000,
    })
    await expect(card(page).getByText(/live \| on-chain/i)).toHaveCount(0)
  })
})
