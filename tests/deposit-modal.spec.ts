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
    await expect(page.getByRole('button', { name: /BNB/ })).toBeVisible()
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

  test('Bridge button stays disabled without a connected EVM wallet', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('button', { name: '+ Deposit' }).click()
    await page.getByRole('button', { name: /Ethereum/ }).click()

    const submitBtn = page.getByRole('button', { name: /Bridge & Deposit/ })
    await expect(submitBtn).toBeDisabled()

    // an amount alone does not unlock it - bridging needs an EVM wallet on mainnet
    await page.getByPlaceholder('0.00').fill('100')
    await expect(submitBtn).toBeDisabled()
  })

  test('on testnet, the modal warns that Allbridge runs on mainnet only', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('button', { name: '+ Deposit' }).click()
    await page.getByRole('button', { name: /Ethereum/ }).click()

    await expect(
      page.getByText(/Allbridge runs on mainnet only/i),
    ).toBeVisible()
  })
})
