import { test, expect } from '@playwright/test'

import { BASE, SOROBAN_RPC_MAINNET, MAINNET_FACTORY, MAINNET_SOURCE, shorten } from './fixtures'

// D5 "the dashboard shows live mainnet data" check, run against the public
// network. it stays a blank harness until the Factory is deployed: with
// PLAYWRIGHT_MAINNET_FACTORY / _SOURCE unset the whole file skips, so it is safe
// to keep in CI and ready to run the moment mainnet lands. mirrors the testnet
// ground-truth pattern in ux-onchain-integration.spec.ts.
const ready = MAINNET_FACTORY !== '' && MAINNET_SOURCE !== ''

async function readAdminAndPoolCount(): Promise<{ admin: string; poolCount: number }> {
  const sdk = await import('@stellar/stellar-sdk')
  const { Contract, TransactionBuilder, BASE_FEE, Networks, rpc, scValToNative } = sdk
  const server = new rpc.Server(SOROBAN_RPC_MAINNET)
  const contract = new Contract(MAINNET_FACTORY)
  const account = await server.getAccount(MAINNET_SOURCE)

  const read = async (method: string) => {
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: Networks.PUBLIC,
    })
      .addOperation(contract.call(method))
      .setTimeout(30)
      .build()
    const sim = await server.simulateTransaction(tx)
    if (rpc.Api.isSimulationError(sim)) throw new Error(`${method}: ${sim.error}`)
    if (!sim.result) throw new Error(`${method}: no result`)
    return scValToNative(sim.result.retval)
  }

  const [admin, poolCount] = await Promise.all([read('get_admin'), read('get_pool_count')])
  return { admin: String(admin), poolCount: Number(poolCount) }
}

// anchor on the Factory card through its heading; the stat labels each carry a
// help tip of their own, so the h3 is the reliable handle
function factoryCard(page: import('@playwright/test').Page) {
  return page
    .getByRole('heading', { name: /Factory contract/ })
    .locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]')
}

async function openCustodyOnMainnet(page: import('@playwright/test').Page) {
  await page.goto(`${BASE}/audit`)
  await page.getByRole('button', { name: 'Mainnet' }).click()
  await expect(page.getByText(/Pools created/i)).toBeVisible({ timeout: 30_000 })
}

test.describe('Live mainnet Factory reads match the /audit DOM', () => {
  test.skip(!ready, 'set PLAYWRIGHT_MAINNET_FACTORY and _SOURCE once the mainnet deploy lands')

  let truth: { admin: string; poolCount: number }

  test.beforeAll(async () => {
    truth = await readAdminAndPoolCount()
  })

  test('Contract ID stat renders the mainnet Factory address', async ({ page }) => {
    await openCustodyOnMainnet(page)
    await expect(factoryCard(page)).toContainText(shorten(MAINNET_FACTORY, 8))
  })

  test('Factory admin from on-chain matches the rendered Admin stat', async ({ page }) => {
    await openCustodyOnMainnet(page)
    await expect(factoryCard(page)).toContainText(shorten(truth.admin, 8))
  })

  test('Factory pool_count from on-chain matches the rendered Pools created', async ({ page }) => {
    await openCustodyOnMainnet(page)
    const stat = page.getByText(/^Pools created$/i).locator('..')
    await expect(stat).toContainText(String(truth.poolCount))
  })

  test('Stellar Expert link points to the Factory on public', async ({ page }) => {
    await openCustodyOnMainnet(page)
    const link = page.getByRole('link', { name: /Stellar Expert/i }).first()
    await expect(link).toBeVisible({ timeout: 30_000 })
    await expect(link).toHaveAttribute(
      'href',
      `https://stellar.expert/explorer/public/contract/${MAINNET_FACTORY}`,
    )
  })
})
