import { test, expect } from '@playwright/test'

import { BASE } from './fixtures'

// no wallet needed: the card reads the network config and the local routing log.
//
// The routing story used to be two cards on two pages, the policy on Positions
// and the recorded routes on Activity. It is one card on Activity now, so these
// all go to the same place.
test.describe('Routing engine card', () => {
  test('renders the broker-first routing policy on Activity', async ({ page }) => {
    await page.goto(BASE + '/activity', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Routing engine')).toBeVisible()
    await expect(page.getByText('Direct exchange')).toBeVisible()
    await expect(page.getByText(/Stellar Broker/i).first()).toBeVisible()
  })

  test('reads the broker off the endpoint without leaking the key state', async ({ page }) => {
    // the broker only runs on mainnet, where quoting is keyless, so the card
    // reads the endpoint this build was set up with and says nothing about the
    // partner key. on testnet the same tile reads "mainnet only".
    await page.addInitScript(() => localStorage.setItem('lob_network', 'mainnet'))
    await page.goto(BASE + '/activity', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/^configured$/)).toBeVisible()
    await expect(page.getByText(/partner key/i)).toHaveCount(0)
  })

  test('reflects the fallback availability for the active network', async ({ page }) => {
    await page.goto(BASE + '/activity', { waitUntil: 'domcontentloaded' })
    // the direct-exchange tile names the router it would fall back to and says
    // whether this build has an address for it, one way or the other
    await expect(page.getByText('Soroswap router')).toBeVisible()
    await expect(page.getByText(/^(router address configured|no router configured)$/)).toBeVisible()
  })

  test('carries the recorded routes, so the story is not split in two', async ({ page }) => {
    await page.goto(BASE + '/activity', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('Routes taken')).toBeVisible()
    // a fresh context has an empty log, which is the state most readers meet.
    // that copy sends them to the Overview Swap button, which swap-modal.spec
    // opens and drives, so the two halves of the instruction both hold.
    await expect(page.getByText(/No swap routed from this browser yet/i)).toBeVisible()
    await expect(page.getByText(/Swap button on the Overview page/i)).toBeVisible()
  })
})
