import { test, expect } from '@playwright/test'

import { gotoWithWallet } from './fixtures'

// Overview only renders "+ Deposit" once a wallet is connected; gotoWithWallet
// seeds the same lob_addr / lob_wname keys WalletContext reads on mount.

test.describe('DepositModal - Allbridge wiring', () => {
  test('opens from the Overview "+ Deposit" button and shows source picker', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('button', { name: '+ Deposit' }).click()

    await expect(page.getByText('Deposit Funds')).toBeVisible()
    await expect(page.getByRole('button', { name: /Stellar/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Ethereum/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Arbitrum/ })).toBeVisible()
    // BNB USDC is 18-decimal and the allowance scaling assumes 6, so the
    // registry marks it unbridgeable and the picker must not offer it
    await expect(page.getByRole('button', { name: /BNB/ })).toHaveCount(0)
  })

  test('selecting an EVM source shows the Allbridge Core panel', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('button', { name: '+ Deposit' }).click()
    await page.getByRole('button', { name: /Arbitrum/ }).click()

    // "Allbridge Core" appears twice in the modal (provider label + testnet
    // warning). Disambiguate by scoping to the label row that pairs with
    // "Bridge provider" - that one only ever has the brand once.
    await expect(page.getByText('Bridge provider')).toBeVisible()
    await expect(page.getByText('Allbridge Core').first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Bridge & Deposit/ })).toBeVisible()
  })

  test('on mainnet the bridge stays locked without an EVM wallet', async ({ page }) => {
    // this is the leg that moves real money, so the guard belongs on the network
    // where it applies rather than on testnet, which only ever simulates
    await page.addInitScript(() => localStorage.setItem('lob_network', 'mainnet'))
    await gotoWithWallet(page)
    await page.getByRole('button', { name: '+ Deposit' }).click()
    await page.getByRole('button', { name: /Ethereum/ }).click()

    const submitBtn = page.getByRole('button', { name: /Bridge & Deposit/ })
    await expect(submitBtn).toBeDisabled()

    // an amount alone does not unlock it, bridging needs an EVM wallet
    await page.getByPlaceholder('0.00').fill('100')
    await expect(submitBtn).toBeDisabled()
  })

  test('on testnet, the modal says nothing will actually move', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('button', { name: '+ Deposit' }).click()
    await page.getByRole('button', { name: /Ethereum/ }).click()

    await expect(page.getByText(/Simulation only/i)).toBeVisible()
    await expect(page.getByText(/without moving funds/i)).toBeVisible()
    await expect(page.getByText(/Switch to mainnet for a real transfer/i)).toBeVisible()
  })

  test('opens from the Bridges page and lands on the bridge flow', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('link', { name: /^Bridges$/ }).click()
    await expect(page).toHaveURL(/\/bridges$/)

    await page.getByRole('button', { name: 'Bridge USDC' }).click()
    await expect(page.getByText('Deposit Funds')).toBeVisible()
    // initialChain points the modal at a bridge chain, so the Allbridge panel
    // is shown straight away rather than the direct-Stellar placeholder
    await expect(page.getByText('Bridge provider')).toBeVisible()
  })
})
