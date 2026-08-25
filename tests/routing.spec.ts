import { test, expect } from '@playwright/test'

import { BASE } from './fixtures'

// no wallet needed: the card reads the network config and the local routing log.
test.describe('Routing engine card', () => {
  test('renders the broker-first routing policy on Positions', async ({ page }) => {
    await page.goto(BASE + '/positions', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Routing engine')).toBeVisible()
    await expect(page.getByText('Direct exchange')).toBeVisible()
    await expect(page.getByText(/Stellar Broker/i).first()).toBeVisible()
  })

  test('reads broker as enabled off the endpoint without leaking the key state', async ({ page }) => {
    // the broker only runs on mainnet, where quoting is keyless, so the card
    // reads "enabled" off the configured endpoint with no partner-key wording
    // on the face. on testnet it reads "mainnet only".
    await page.addInitScript(() => localStorage.setItem('lob_network', 'mainnet'))
    await page.goto(BASE + '/positions', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/^enabled$/)).toBeVisible()
    await expect(page.getByText(/partner key/i)).toHaveCount(0)
  })

  test('reflects the fallback availability for the active network', async ({ page }) => {
    await page.goto(BASE + '/positions', { waitUntil: 'domcontentloaded' })
    // the card only claims a route it can take: either the soroswap router is
    // wired for the active network, or it reads as not configured.
    await expect(page.getByText(/^(configured|not configured)$/i).first()).toBeVisible()
  })
})
