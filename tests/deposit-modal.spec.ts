import { test, expect } from '@playwright/test'

const BASE = 'https://stellar-integrations-blush.vercel.app'

// The Overview page only renders the "+ Deposit" button when a wallet
// is connected — otherwise it shows a "Connect your wallet to get
// started" call-to-action. For the DepositModal tests we simulate a
// pre-connected wallet by seeding localStorage before the page loads
// (the WalletContext reads `lob_addr` and `lob_wname` on mount).
//
// We use a known testnet G-address (the one generated for this project,
// lobster-test) — it's a real, fundable account, no PII.
const FAKE_WALLET = {
  address: 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU',
  name: 'Freighter',
}

async function gotoWithWallet(page: import('@playwright/test').Page) {
  await page.addInitScript(([addr, name]) => {
    localStorage.setItem('lob_addr', addr)
    localStorage.setItem('lob_wname', name)
  }, [FAKE_WALLET.address, FAKE_WALLET.name] as const)
  await page.goto(BASE, { waitUntil: 'networkidle' })
}

test.describe('DepositModal — Allbridge wiring', () => {
  test('opens from the Overview "+ Deposit" button and shows source picker', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('button', { name: '+ Deposit' }).click()

    await expect(page.getByText('Deposit Funds')).toBeVisible()
    await expect(page.getByRole('button', { name: /Stellar/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Ethereum/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /Arbitrum/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /BNB/ })).toBeVisible()
  })

  test('selecting an EVM source surfaces the Allbridge Core panel', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('button', { name: '+ Deposit' }).click()
    await page.getByRole('button', { name: /Arbitrum/ }).click()

    // "Allbridge Core" appears twice in the modal (provider label + testnet
    // warning). Disambiguate by scoping to the label row that pairs with
    // "Bridge provider" — that one only ever has the brand once.
    await expect(page.getByText('Bridge provider')).toBeVisible()
    await expect(page.getByText('Allbridge Core').first()).toBeVisible()
    await expect(page.getByRole('button', { name: /Bridge & Deposit/ })).toBeVisible()
  })

  test('Bridge button stays disabled until an amount is entered', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('button', { name: '+ Deposit' }).click()
    await page.getByRole('button', { name: /Ethereum/ }).click()

    const submitBtn = page.getByRole('button', { name: /Bridge & Deposit/ })
    await expect(submitBtn).toBeDisabled()

    await page.getByPlaceholder('0.00').fill('100')
    await expect(submitBtn).toBeEnabled()
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
