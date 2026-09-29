import { test, expect } from '@playwright/test'

import { DEMO_VAULT_OWNER, gotoWithWallet } from './fixtures'

// the seeded wallet owns no vault, which is the case the create path is for
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

  test('offers the same create path on mainnet', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('lob_network', 'mainnet'))
    await gotoWithWallet(page, '/positions')
    const create = page.getByRole('button', { name: /^\+ Create vault$/ })
    await expect(create).toBeVisible({ timeout: 25000 })
    await expect(page.getByText(/factory is not deployed/i)).toHaveCount(0)
    await create.click()
    await expect(page.getByRole('heading', { name: 'Create a vault' })).toBeVisible()
  })
})

async function asOwner(page: import('@playwright/test').Page) {
  await page.addInitScript((a) => {
    localStorage.setItem('lob_addr', a)
    localStorage.setItem('lob_wname', 'Freighter')
  }, DEMO_VAULT_OWNER)
  await page.goto('/positions', { waitUntil: 'domcontentloaded' })
}

test.describe('vault detail', () => {
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
    const cards = page.getByRole('button', { name: 'Hide', exact: true })
    await expect(cards.first()).toBeVisible({ timeout: 30000 })
    const before = await cards.count()
    expect(before).toBeGreaterThan(0)

    await cards.first().click()
    await expect(page.getByText(/vaults? hidden in this browser/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Hide', exact: true })).toHaveCount(before - 1)

    // the wording has to be clear that nothing left the chain
    await expect(page.getByText(/still on-chain and still yours/)).toBeVisible()

    await page.getByRole('button', { name: 'Show them again' }).click()
    await expect(page.getByRole('button', { name: 'Hide', exact: true })).toHaveCount(before)
  })

  test('remembers what was hidden across a reload', async ({ page }) => {
    await asOwner(page)
    const hide = page.getByRole('button', { name: 'Hide', exact: true })
    await expect(hide.first()).toBeVisible({ timeout: 30000 })
    const before = await hide.count()
    await hide.first().click()

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByText(/vaults? hidden in this browser/)).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole('button', { name: 'Hide', exact: true })).toHaveCount(before - 1)

    await page.getByRole('button', { name: 'Show them again' }).click()
    await expect(page.getByRole('button', { name: 'Hide', exact: true })).toHaveCount(before)
  })
})

test.describe('a crowded vault list', () => {
  // pull the figure out of the card text; a text selector would need its own escaping
  async function cardValues(page: import('@playwright/test').Page): Promise<number[]> {
    const texts = await page
      .locator('div.rounded-3xl')
      .filter({ hasText: 'What this vault holds and where' })
      .allInnerTexts()
    return texts
      .map((t) => /VALUE\s+([\d.,]+)/.exec(t)?.[1])
      .filter((v): v is string => !!v)
      .map((v) => Number(v.replace(/,/g, '')))
  }

  test('puts the vault that holds something above the one that does not', async ({ page }) => {
    await asOwner(page)
    await expect(page.getByRole('button', { name: 'Hide', exact: true }).first()).toBeVisible({ timeout: 30000 })

    const values = await cardValues(page)
    expect(values.length).toBeGreaterThan(1)
    for (let i = 1; i < values.length; i++) {
      expect(values[i - 1]).toBeGreaterThanOrEqual(values[i])
    }
  })

  test('clears the empty ones out of the way in one click, and brings them back', async ({
    page,
  }) => {
    await asOwner(page)
    const cards = page.getByRole('button', { name: 'Hide', exact: true })
    await expect(cards.first()).toBeVisible({ timeout: 30000 })
    const before = await cards.count()

    const tidy = page.getByRole('button', { name: /Tidy away the \d+ empty one/ })
    await expect(tidy).toBeVisible()
    const emptied = Number((await tidy.innerText()).replace(/\D/g, ''))
    expect(emptied).toBeGreaterThan(0)
    await tidy.click()

    await expect(page.getByRole('button', { name: 'Hide', exact: true })).toHaveCount(before - emptied)
    await expect(page.getByText(/still on-chain and still yours/)).toBeVisible()

    await page.getByRole('button', { name: 'Show them again' }).click()
    await expect(page.getByRole('button', { name: 'Hide', exact: true })).toHaveCount(before)
  })
})
