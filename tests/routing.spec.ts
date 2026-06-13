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

  test('states the broker partner key status instead of claiming online', async ({ page }) => {
    await page.goto(BASE + '/positions', { waitUntil: 'networkidle' })
    // local builds have no VITE_STELLAR_BROKER_PARTNER_KEY so this reads
    // "missing"; a deploy with the key reads "set". both are honest states.
    await expect(page.getByText(/partner key (set|missing)/)).toBeVisible()
  })

  test('reflects the fallback availability for the active network', async ({ page }) => {
    await page.goto(BASE + '/positions', { waitUntil: 'networkidle' })
    // testnet has no soroswap router in config, so the fallback reads as not
    // configured; the card never claims a route it cannot take
    await expect(page.getByText(/soroswap (router live|not configured)/i)).toBeVisible()
  })
})
