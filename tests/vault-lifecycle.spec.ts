import { test, expect } from '@playwright/test'

import { DEMO_VAULT_OWNER, gotoWithWallet } from './fixtures'

// The wallet these specs seed owns no vault, which is the case that matters for
// the create path: the page has to offer it rather than show an empty list and
// stop there.
test.describe('vault lifecycle', () => {
  test('offers to create a vault, and says a vault cannot be deleted', async ({ page }) => {
    await gotoWithWallet(page, '/positions')
    await expect(page.getByRole('heading', { name: 'Positions', exact: true })).toBeVisible()

    const create = page.getByRole('button', { name: /Create (a |your first )?vault/ }).first()
    await expect(create).toBeVisible({ timeout: 25000 })
    await create.click()

    await expect(page.getByRole('heading', { name: 'Create a vault' })).toBeVisible()
    await expect(page.getByText(/A vault cannot be deleted afterwards/)).toBeVisible()
    // deploying a contract is not free, and the modal has to say so before signing
    await expect(page.getByText(/costs a network fee/)).toBeVisible()

    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('heading', { name: 'Create a vault' })).toHaveCount(0)
  })

  test('will not offer a vault on a network with no factory', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('lob_network', 'mainnet'))
    await gotoWithWallet(page, '/positions')
    // the factory card and the vault list both say it, so pin the exact one
    await expect(
      page.getByText('Not deployed on mainnet yet.', { exact: true }),
    ).toBeVisible({ timeout: 25000 })
    await expect(page.getByRole('button', { name: /^\+ Create vault$/ })).toHaveCount(0)
  })
})

test.describe('vault detail', () => {
  // this wallet owns the demo vaults, so it is the one that has cards to open
  const OWNER = DEMO_VAULT_OWNER

  async function asOwner(page: import('@playwright/test').Page) {
    await page.addInitScript((a) => {
      localStorage.setItem('lob_addr', a)
      localStorage.setItem('lob_wname', 'Freighter')
    }, OWNER)
    await page.goto('/positions', { waitUntil: 'domcontentloaded' })
  }

  test('opens a vault and reads its contract for the rest', async ({ page }) => {
    await asOwner(page)
    const toggle = page.getByText('What this vault holds and where').first()
    await expect(toggle).toBeVisible({ timeout: 30000 })
    await toggle.click()

    await expect(page.getByText('Vault contract').first()).toBeVisible()
    await expect(page.getByText('Owner').first()).toBeVisible()
    await expect(page.getByText('Working on').first()).toBeVisible()
    // read off the vault itself rather than assumed from the pair
    await expect(page.getByText('Approver').first()).toBeVisible({ timeout: 30000 })
    await expect(page.getByText(/A vault cannot be deleted\./).first()).toBeVisible()
    await expect(page.getByText(/No return figure here on purpose/).first()).toBeVisible()
  })

  test('sends the vault trail to activity, filtered to that vault', async ({ page }) => {
    await asOwner(page)
    const toggle = page.getByText('What this vault holds and where').first()
    await expect(toggle).toBeVisible({ timeout: 30000 })
    await toggle.click()

    await page.getByRole('link', { name: 'Every operation on this vault' }).first().click()
    await expect(page).toHaveURL(/\/activity\?q=C[A-Z0-9]+/)
    const box = page.getByRole('searchbox', { name: /Search this account/ })
    await expect(box).toHaveValue(/^C[A-Z0-9]+$/, { timeout: 25000 })
  })

  test('hides a vault locally and brings it back', async ({ page }) => {
    await asOwner(page)
    const cards = page.getByRole('button', { name: 'Hide' })
    await expect(cards.first()).toBeVisible({ timeout: 30000 })
    const before = await cards.count()
    expect(before).toBeGreaterThan(0)

    await cards.first().click()
    await expect(page.getByText(/vaults? hidden in this browser/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Hide' })).toHaveCount(before - 1)

    // the wording has to be clear that nothing left the chain
    await expect(page.getByText(/still on-chain and still yours/)).toBeVisible()

    await page.getByRole('button', { name: 'Show them again' }).click()
    await expect(page.getByRole('button', { name: 'Hide' })).toHaveCount(before)
  })

  test('remembers what was hidden across a reload', async ({ page }) => {
    await asOwner(page)
    const hide = page.getByRole('button', { name: 'Hide' })
    await expect(hide.first()).toBeVisible({ timeout: 30000 })
    const before = await hide.count()
    await hide.first().click()

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/vaults? hidden in this browser/)).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole('button', { name: 'Hide' })).toHaveCount(before - 1)

    await page.getByRole('button', { name: 'Show them again' }).click()
    await expect(page.getByRole('button', { name: 'Hide' })).toHaveCount(before)
  })
})
