import { test, expect } from '@playwright/test'

import { gotoWithWallet } from './fixtures'

test.describe('positions', () => {
  test('is reachable from the sidebar', async ({ page }) => {
    await gotoWithWallet(page, '/')
    await page.getByRole('link', { name: 'Positions', exact: true }).click()
    await expect(page).toHaveURL(/\/positions$/)
    await expect(page.getByRole('heading', { name: 'Positions' })).toBeVisible()
  })

  test('is about this wallet and nothing else', async ({ page }) => {
    await gotoWithWallet(page, '/positions')
    await expect(page.getByRole('heading', { name: 'Positions' })).toBeVisible()
    // the custody demo and protocol cards belong on Custody, not here
    await expect(page.getByRole('heading', { name: /Sign a testnet transaction/i })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Factory contract' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: /Contract storage lease/ })).toHaveCount(0)
    await expect(page.getByText('Routing engine')).toHaveCount(0)
  })

  test('asks for a wallet when none is connected', async ({ page }) => {
    await page.goto('/positions', { waitUntil: 'domcontentloaded' })
    await expect(
      page.getByText(/Connect a wallet to see the vaults it owns/i),
    ).toBeVisible()
  })
})

test.describe('the factory and sign cards on custody', () => {
  test('shows the Factory card with a Stellar Expert link on testnet', async ({ page }) => {
    await gotoWithWallet(page, '/audit')
    await expect(page.getByRole('heading', { name: 'Factory contract' })).toBeVisible()
    // static parts only. the public rpc can rate-limit a headless runner
    await expect(page.getByText(/Stellar Expert/).first()).toBeVisible()
  })

  test('names the wallet on the sign demo button', async ({ page }) => {
    await gotoWithWallet(page, '/audit')
    await expect(page.getByRole('heading', { name: /Sign a testnet transaction/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Call the Factory with Freighter/i })).toBeVisible()
  })
})
