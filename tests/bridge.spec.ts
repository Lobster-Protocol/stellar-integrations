import { test, expect, type Page } from '@playwright/test'

import { gotoWithWallet, TEST_WALLET } from './fixtures'

// Everything up to the first signature. Signing needs a funded EVM wallet, so
// that part is checked on chain rather than here.

// a burn that never got delivered, the way the page stores one
async function seedPendingTransfer(page: Page) {
  await page.addInitScript((recipient) => {
    localStorage.setItem(
      'lob_cctp_transfers_testnet',
      JSON.stringify([
        {
          id: `0x${'ab'.repeat(32)}`,
          network: 'testnet',
          chainKey: 'BASE',
          chainName: 'Base Sepolia',
          sourceDomain: 6,
          amount: '5',
          recipient,
          finality: 'fast',
          createdAt: 1_760_000_000_000,
          stage: 'burned',
        },
      ]),
    )
  }, TEST_WALLET.address)
}

test.describe('the bridge form', () => {
  test('on testnet it offers the Sepolia chains Circle attests', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('button', { name: '+ Deposit' }).click()

    await expect(page.getByRole('heading', { name: 'Bridge USDC to Stellar' })).toBeVisible()
    for (const name of ['Base Sepolia', 'Arbitrum Sepolia', 'Ethereum Sepolia']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
    }
    await expect(page.getByRole('button', { name: /BNB/ })).toHaveCount(0)
  })

  test('on mainnet it offers the mainnet chains and no testnet one', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('lob_network', 'mainnet'))
    await gotoWithWallet(page)
    await page.getByRole('button', { name: '+ Deposit' }).click()

    for (const name of ['Base', 'Arbitrum', 'Ethereum']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
    }
    await expect(page.getByText(/Sepolia/)).toHaveCount(0)
  })

  test('names Circle CCTP as the carrier and checks the trustline', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('button', { name: '+ Deposit' }).click()

    await expect(page.getByText('Carried by')).toBeVisible()
    await expect(page.getByText('Circle CCTP').first()).toBeVisible()
    await expect(page.getByText('Trustline', { exact: false }).first()).toBeVisible()
  })

  test('stays locked without an EVM wallet, even with an amount', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('button', { name: '+ Deposit' }).click()

    await page.getByPlaceholder('0.00').fill('5')
    await expect(page.getByRole('button', { name: /^Bridge 5 USDC$/ })).toBeDisabled()
  })

  test('refuses a seventh decimal instead of rounding it away', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('button', { name: '+ Deposit' }).click()

    await page.getByPlaceholder('0.00').fill('1.0000001')
    await expect(page.getByText(/at most 6 decimals/)).toBeVisible()
  })

  test('the close button says what it closes', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('button', { name: '+ Deposit' }).click()
    await page.getByRole('button', { name: 'Close bridge' }).click()
    await expect(page.getByRole('heading', { name: 'Bridge USDC to Stellar' })).toHaveCount(0)
  })

  test('opens from the Bridges page too', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('link', { name: /^Bridges$/ }).click()
    await expect(page).toHaveURL(/\/bridges$/)

    await page.getByRole('button', { name: 'Bridge USDC' }).click()
    await expect(page.getByRole('heading', { name: 'Bridge USDC to Stellar' })).toBeVisible()
  })
})

test.describe('the Bridges page', () => {
  test('draws the route through Circle CCTP', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('link', { name: /^Bridges$/ }).click()

    const route = page.getByText('The route').locator('xpath=ancestor::div[contains(@class,"rounded")][1]')
    await expect(route).toContainText('Circle CCTP')
    await expect(page.getByText(/every step is real/)).toBeVisible()
  })

  test('offers other routes that open outside, with no opener handed over', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('link', { name: /^Bridges$/ }).click()

    for (const label of ['Allbridge Core', 'Allbridge Classic', 'StellarX', 'Aquarius', 'Stellar anchors']) {
      const link = page.getByRole('link', { name: new RegExp(label) })
      await expect(link).toHaveAttribute('target', '_blank')
      await expect(link).toHaveAttribute('rel', /noopener/)
    }
  })

  test('shows the test USDC faucet on testnet only', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('link', { name: /^Bridges$/ }).click()
    await expect(page.getByRole('link', { name: /Circle faucet/ })).toBeVisible()

    await page.getByRole('button', { name: 'Mainnet' }).click()
    await expect(page.getByRole('link', { name: /Circle faucet/ })).toHaveCount(0)
  })

  test('offers to finish a transfer that was burned and never delivered', async ({ page }) => {
    // Circle has not indexed a made-up burn, which is exactly what a fresh one looks like
    await page.route('**/iris-api-sandbox.circle.com/**', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Message not found"}' }),
    )
    await seedPendingTransfer(page)
    await gotoWithWallet(page)
    await page.getByRole('link', { name: /^Bridges$/ }).click()

    await expect(page.getByText('Waiting to be delivered')).toBeVisible()
    await expect(page.getByText('5 USDC from Base Sepolia')).toBeVisible()
    await page.getByRole('button', { name: 'Finish' }).click()

    await expect(page.getByText('Burned on Base Sepolia')).toBeVisible()
    await expect(page.getByText(/Waiting for Circle to sign the burn/)).toBeVisible()
    await expect(page.getByRole('button', { name: /Waiting for Circle/ })).toBeDisabled()
  })

  test('keeps a testnet transfer off the mainnet page', async ({ page }) => {
    await seedPendingTransfer(page)
    await page.addInitScript(() => localStorage.setItem('lob_network', 'mainnet'))
    await gotoWithWallet(page)
    await page.getByRole('link', { name: /^Bridges$/ }).click()

    await expect(page.getByRole('heading', { name: 'Bridges', exact: true })).toBeVisible()
    await expect(page.getByText('Waiting to be delivered')).toHaveCount(0)
  })

  test('forgets a tracked transfer once asked twice', async ({ page }) => {
    await seedPendingTransfer(page)
    await gotoWithWallet(page)
    await page.getByRole('link', { name: /^Bridges$/ }).click()

    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'forget' }).click()
    await expect(page.getByText('Waiting to be delivered')).toHaveCount(0)
  })
})
