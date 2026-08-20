import { test, expect } from '@playwright/test'

import { BASE } from './fixtures'

// the routing engine card states the broker-first / soroswap-fallback policy and
// shows live broker + fallback availability off config. no wallet needed, it
// reads the network config and the local routing log.
test.describe('Routing engine card', () => {
  test('renders the broker-first routing policy on Positions', async ({ page }) => {
    await page.goto(BASE + '/positions', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Routing engine')).toBeVisible()
    await expect(page.getByText('Direct DEX fallback')).toBeVisible()
    await expect(page.getByText(/Swaps go through Stellar Broker first/i)).toBeVisible()
  })

  test('reads broker as live off the endpoint without leaking the key state', async ({ page }) => {
    // the broker only runs on mainnet, where quoting is keyless, so the card
    // reads "best execution live" off the configured endpoint with no
    // partner-key wording on the face. on testnet it reads "mainnet only".
    await page.addInitScript(() => localStorage.setItem('lob_network', 'mainnet'))
    await page.goto(BASE + '/positions', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/best execution live/)).toBeVisible()
    await expect(page.getByText(/partner key/i)).toHaveCount(0)
  })

  test('reflects the fallback availability for the active network', async ({ page }) => {
    await page.goto(BASE + '/positions', { waitUntil: 'domcontentloaded' })
    // the card only claims a route it can take: either the soroswap router is
    // wired for the active network, or it reads as not configured.
    await expect(page.getByText(/soroswap (router live|not configured)/i)).toBeVisible()
  })
})
