import { test, expect } from '@playwright/test'

import { gotoWithWallet } from './fixtures'

test.describe('Positions page - live on-chain data', () => {
  test('reachable via sidebar and renders the heading', async ({ page }) => {
    await gotoWithWallet(page, '/')
    await page.getByRole('link', { name: 'Positions', exact: true }).click()
    await expect(page).toHaveURL(/\/positions$/)
    await expect(page.getByText('Lobster Positions')).toBeVisible()
  })

  test('shows the Factory card with a Stellar Expert link on testnet', async ({ page }) => {
    await gotoWithWallet(page, '/positions')
    await expect(page.getByRole('heading', { name: 'Factory contract' })).toBeVisible()
    // public RPC can rate-limit a headless runner, so we only assert the
    // static UI elements that show up once the Factory id is configured.
    await expect(page.getByText(/Stellar Expert/).first()).toBeVisible()
  })

  test('shows the Sign demo card with the wallet name in the button label', async ({ page }) => {
    await gotoWithWallet(page, '/positions')
    await expect(page.getByRole('heading', { name: /Sign a testnet transaction/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Ping Factory with Freighter/i })).toBeVisible()
  })

  test('without a connected wallet, the page prompts to connect', async ({ page }) => {
    await page.goto('/positions', { waitUntil: 'domcontentloaded' })
    await expect(
      page.getByText(/Connect a wallet to see your positions/i),
    ).toBeVisible()
  })
})
