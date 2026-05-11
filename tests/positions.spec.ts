import { test, expect } from '@playwright/test'

const BASE = 'https://stellar-integrations-blush.vercel.app'

const FAKE_WALLET = {
  address: 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU',
  name: 'Freighter',
}

async function withConnectedWallet(page: import('@playwright/test').Page) {
  await page.addInitScript(([addr, name]) => {
    localStorage.setItem('lob_addr', addr)
    localStorage.setItem('lob_wname', name)
  }, [FAKE_WALLET.address, FAKE_WALLET.name] as const)
}

test.describe('Positions page — live on-chain data', () => {
  test('reachable via sidebar and renders the heading', async ({ page }) => {
    await withConnectedWallet(page)
    await page.goto(BASE, { waitUntil: 'networkidle' })
    await page.getByRole('link', { name: 'Positions', exact: true }).click()
    await expect(page).toHaveURL(/\/positions$/)
    await expect(page.getByText('Lobster Positions')).toBeVisible()
  })

  test('shows the Factory card with a Stellar Expert link on testnet', async ({ page }) => {
    await withConnectedWallet(page)
    await page.goto(`${BASE}/positions`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: 'Factory contract' })).toBeVisible()
    // We don't assert the network read succeeded — the public RPC can rate-limit
    // a headless test runner. We just check the static UI elements that always
    // appear when the Factory id is configured.
    await expect(page.getByText(/Stellar Expert/).first()).toBeVisible()
  })

  test('shows the Sign demo card with the wallet name in the button label', async ({ page }) => {
    await withConnectedWallet(page)
    await page.goto(`${BASE}/positions`, { waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { name: /Sign a testnet transaction/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /Ping Factory with Freighter/i })).toBeVisible()
  })

  test('without a connected wallet, the page prompts to connect', async ({ page }) => {
    await page.goto(`${BASE}/positions`, { waitUntil: 'networkidle' })
    await expect(
      page.getByText(/Connect a wallet to see your positions/i),
    ).toBeVisible()
  })
})
