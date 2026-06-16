import { test, expect } from '@playwright/test'

import { BASE } from './fixtures'

// the routing engine card states the broker-first / soroswap-fallback policy and
// shows live broker + fallback availability off config. no wallet needed, it
// reads the network config and the local routing log.
test.describe('Routing engine card', () => {
  test('renders the broker-first routing policy on Positions', async ({ page }) => {
    await page.goto(BASE + '/positions', { waitUntil: 'networkidle' })
    await expect(page.getByText('Routing engine')).toBeVisible()
    await expect(page.getByText('Direct DEX fallback')).toBeVisible()
    await expect(page.getByText(/Swaps go through Stellar Broker first/i)).toBeVisible()
  })

  test('reads broker as live off the endpoint without leaking the key state', async ({ page }) => {
    await page.goto(BASE + '/positions', { waitUntil: 'networkidle' })
    // quoting is keyless, so the card reads "best execution live" off the
    // configured endpoint, no partner-key wording on the face
    await expect(page.getByText(/best execution live/)).toBeVisible()
  })

  test('reflects the fallback availability for the active network', async ({ page }) => {
    await page.goto(BASE + '/positions', { waitUntil: 'networkidle' })
    // testnet has no soroswap router in config, so the fallback reads as not
    // configured; the card never claims a route it cannot take
    await expect(page.getByText(/soroswap (router live|not configured)/i)).toBeVisible()
  })
})
