import { test, expect, type Page } from '@playwright/test'
import { gotoWithWallet } from './fixtures'

// ci points VITE_LOBSTER_API_URL at a dead 127.0.0.1, and the card is slow to give up on
// it: a refused localhost connect takes two seconds on windows and the query retries once
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
