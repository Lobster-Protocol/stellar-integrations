import { test, expect } from '@playwright/test'

import { BASE } from './fixtures'

// no wallet needed. the card reads network config and the local routing log
test.describe('Routing engine card', () => {
  test('names the broker and the direct exchange on Activity', async ({ page }) => {
    await page.goto(BASE + '/activity', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Routing engine')).toBeVisible()
    await expect(page.getByText('Direct exchange')).toBeVisible()
    await expect(page.getByText(/Stellar Broker/i).first()).toBeVisible()
  })

  test('reads the broker off the endpoint without leaking the key state', async ({ page }) => {
    // the broker quotes keyless on mainnet only; testnet shows "mainnet only"
    await page.addInitScript(() => localStorage.setItem('lob_network', 'mainnet'))
    await page.goto(BASE + '/activity', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/^configured$/)).toBeVisible()
    await expect(page.getByText(/partner key/i)).toHaveCount(0)
  })

  test('reflects the fallback availability for the active network', async ({ page }) => {
    await page.goto(BASE + '/activity', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Soroswap router')).toBeVisible()
    // either one, depending on whether this build has a router address
    await expect(page.getByText(/^(router address configured|no router configured)$/)).toBeVisible()
  })

  test('shows the routes taken', async ({ page }) => {
    await page.goto(BASE + '/activity', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Routes taken')).toBeVisible()
    // a fresh context has an empty log. the Swap button itself is in swap-modal.spec
    await expect(page.getByText(/No swap routed from this browser yet/i)).toBeVisible()
    await expect(page.getByText(/Swap button on the Overview page/i)).toBeVisible()
  })
})
