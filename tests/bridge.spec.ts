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

// a burn out of Stellar that Circle has not signed yet, as the page stores one
async function seedTransferOut(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      'lob_cctp_transfers_testnet',
      JSON.stringify([
        {
          id: 'cd'.repeat(32),
          direction: 'from-stellar',
          network: 'testnet',
          chainKey: 'BASE',
          chainName: 'Base Sepolia',
          sourceDomain: 27,
          amount: '2',
          recipient: `0x${'11'.repeat(20)}`,
          finality: 'standard',
          forwarded: true,
          createdAt: 1_760_000_000_000,
          stage: 'burned',
        },
      ]),
    )
  })
}

async function openBridge(page: Page) {
  await gotoWithWallet(page)
  await page.getByRole('button', { name: '+ Deposit' }).click()
}

test.describe('the bridge form', () => {
  test('on testnet it offers the Sepolia chains Circle attests', async ({ page }) => {
    await openBridge(page)

    await expect(page.getByRole('heading', { name: 'Bridge USDC to Stellar' })).toBeVisible()
    for (const name of ['Base Sepolia', 'Arbitrum Sepolia', 'Ethereum Sepolia']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
    }
    await expect(page.getByRole('button', { name: /BNB/ })).toHaveCount(0)
  })

  test('on mainnet it offers the mainnet chains and no testnet one', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('lob_network', 'mainnet'))
    await openBridge(page)

    for (const name of ['Base', 'Arbitrum', 'Ethereum']) {
      await expect(page.getByRole('button', { name, exact: true })).toBeVisible()
    }
    await expect(page.getByText(/Sepolia/)).toHaveCount(0)
  })

  test('names Circle CCTP as the carrier and checks the trustline', async ({ page }) => {
    await openBridge(page)

    await expect(page.getByText('Carried by')).toBeVisible()
    await expect(page.getByText('Circle CCTP').first()).toBeVisible()
    await expect(page.getByText('Trustline', { exact: false }).first()).toBeVisible()
  })

  test('stays locked without an EVM wallet, even with an amount', async ({ page }) => {
    await openBridge(page)

    await page.getByPlaceholder('0.00').fill('5')
    await expect(page.getByRole('button', { name: /^Bridge 5 USDC$/ })).toBeDisabled()
  })

  test('refuses a seventh decimal instead of rounding it away', async ({ page }) => {
    await openBridge(page)

    await page.getByPlaceholder('0.00').fill('1.0000001')
    await expect(page.getByText('USDC has 6 decimals on this chain, not 7.')).toBeVisible()
  })

  test('says why zero is not an amount', async ({ page }) => {
    await openBridge(page)

    await page.getByPlaceholder('0.00').fill('0')
    await expect(page.getByText('The amount has to be more than zero.')).toBeVisible()
  })

  test('keeps the keyboard inside the dialog', async ({ page }) => {
    await openBridge(page)

    for (let i = 0; i < 20; i++) await page.keyboard.press('Tab')
    const inside = await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))
    expect(inside).toBe(true)
  })

  test('names the amount field for a screen reader', async ({ page }) => {
    await openBridge(page)

    await expect(page.getByRole('textbox', { name: 'Amount in USDC' })).toBeVisible()
  })

  test('the close button says what it closes', async ({ page }) => {
    await openBridge(page)
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

  test('says so when a fast transfer overruns', async ({ page }) => {
    await page.route('**/iris-api-sandbox.circle.com/**', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Message not found"}' }),
    )
    await seedPendingTransfer(page)
    await gotoWithWallet(page)
    await page.getByRole('link', { name: /^Bridges$/ }).click()
    await page.getByRole('button', { name: 'Finish' }).click()

    await expect(page.getByText(/taking longer than a fast transfer should/)).toBeVisible()
  })

  test("puts Circle's reason for holding a transfer in plain words", async ({ page }) => {
    const held = { message: '0x', attestation: 'PENDING', eventNonce: '1', cctpVersion: 2, status: 'pending_confirmations', delayReason: 'insufficient_fee' }
    await page.route('**/iris-api-sandbox.circle.com/v2/messages/**', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ messages: [held] }) }),
    )
    await seedPendingTransfer(page)
    await gotoWithWallet(page)
    await page.getByRole('link', { name: /^Bridges$/ }).click()
    await page.getByRole('button', { name: 'Finish' }).click()

    await expect(page.getByText(/the fast fee rose above what the burn allowed/)).toBeVisible()
  })

  test('keeps a testnet transfer off the mainnet page', async ({ page }) => {
    await seedPendingTransfer(page)
    await page.addInitScript(() => localStorage.setItem('lob_network', 'mainnet'))
    await gotoWithWallet(page)
    await page.getByRole('link', { name: /^Bridges$/ }).click()

    await expect(page.getByRole('heading', { name: 'Bridges', exact: true })).toBeVisible()
    await expect(page.getByText('Waiting to be delivered')).toHaveCount(0)
  })

  test('refuses to look up something that is not a burn hash', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('link', { name: /^Bridges$/ }).click()

    const field = page.getByRole('textbox', { name: 'Burn transaction hash' })
    await field.fill('0x1234')
    await field.press('Enter')
    await expect(page.getByText(/Enter a transaction hash/)).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('forgets a tracked transfer once asked twice', async ({ page }) => {
    await seedPendingTransfer(page)
    await gotoWithWallet(page)
    await page.getByRole('link', { name: /^Bridges$/ }).click()

    page.once('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'forget' }).click()
    await expect(page.getByText('Waiting to be delivered')).toHaveCount(0)
  })

  test('shows both wallets, each with its own way to connect', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('link', { name: /^Bridges$/ }).click()

    await expect(page.getByText('Your wallets')).toBeVisible()
    await expect(page.getByText('EVM wallet', { exact: true })).toBeVisible()
    await expect(page.getByText('Stellar wallet', { exact: true })).toBeVisible()
    await expect(page.getByText(/Sends USDC from Base Sepolia, Arbitrum Sepolia, Ethereum Sepolia/)).toBeVisible()
  })

  test('lists a transfer out of Stellar with where it stands', async ({ page }) => {
    await page.route('**/iris-api-sandbox.circle.com/**', (route) =>
      route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Message not found"}' }),
    )
    await seedTransferOut(page)
    await gotoWithWallet(page)
    await page.getByRole('link', { name: /^Bridges$/ }).click()

    const row = page.getByRole('listitem').filter({ hasText: '2 USDC to Base Sepolia' })
    await expect(row).toBeVisible()
    await expect(row.getByText('Waiting for Circle to sign')).toBeVisible()
    await row.getByRole('button', { name: 'Finish' }).click()
    await expect(page.getByRole('heading', { name: 'Bridge USDC from Stellar' })).toBeVisible()
    await expect(page.getByText('Burned on Stellar')).toBeVisible()
  })

  test('refuses a Stellar hash of the wrong shape when finishing elsewhere', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('link', { name: /^Bridges$/ }).click()

    await page.getByRole('button', { name: 'Stellar', exact: true }).click()
    const field = page.getByRole('textbox', { name: 'Burn transaction hash' })
    await field.fill('abcd')
    await field.press('Enter')
    await expect(page.getByText(/Enter a Stellar transaction hash/)).toBeVisible()
  })
})

test.describe('the way out of Stellar', () => {
  test('opens from its own button and offers the chains to send to', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('link', { name: /^Bridges$/ }).click()
    await page.getByRole('button', { name: 'Send out of Stellar' }).click()

    await expect(page.getByRole('heading', { name: 'Bridge USDC from Stellar' })).toBeVisible()
    for (const name of ['Base Sepolia', 'Arbitrum Sepolia', 'Ethereum Sepolia']) {
      await expect(page.getByRole('dialog').getByRole('button', { name, exact: true })).toBeVisible()
    }
    await expect(page.getByRole('button', { name: /Circle delivers it/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /I receive it myself/ })).toBeVisible()
  })

  test('switches direction from the bridge window, and back', async ({ page }) => {
    await openBridge(page)
    await page.getByRole('button', { name: 'Out of Stellar' }).click()
    await expect(page.getByRole('heading', { name: 'Bridge USDC from Stellar' })).toBeVisible()
    await page.getByRole('button', { name: 'Into Stellar' }).click()
    await expect(page.getByRole('heading', { name: 'Bridge USDC to Stellar' })).toBeVisible()
  })

  test('asks for the receiving EVM wallet before it sends', async ({ page }) => {
    await openBridge(page)
    await page.getByRole('button', { name: 'Out of Stellar' }).click()
    await page.getByRole('textbox', { name: 'Amount in USDC' }).fill('1')

    await expect(page.getByText('Connect the EVM wallet that should receive the USDC.')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Send 1 USDC to/ })).toBeDisabled()
  })

  test('refuses a seventh decimal on the way out too', async ({ page }) => {
    await openBridge(page)
    await page.getByRole('button', { name: 'Out of Stellar' }).click()
    await page.getByRole('textbox', { name: 'Amount in USDC' }).fill('1.1234567')

    await expect(page.getByText('The bridge carries USDC to 6 decimals, not 7.')).toBeVisible()
  })
})
