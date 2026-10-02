import { test, expect } from '@playwright/test'

import { BASE, SOROBAN_RPC_MAINNET, MAINNET_FACTORY, MAINNET_SOURCE, shorten } from './fixtures'

const ready = MAINNET_FACTORY !== '' && MAINNET_SOURCE !== ''

interface Truth {
  admin: string
  poolCount: number
  // the newest vault, the one the Factory card lists first
  vault: string
  owner: string
  // the newest vault whose tokens sit in Soroswap; a fresh vault can be empty
  placed: { vault: string; owner: string }
}

async function readFactory(): Promise<Truth> {
  const sdk = await import('@stellar/stellar-sdk')
  const { Contract, TransactionBuilder, BASE_FEE, Networks, rpc, scValToNative, nativeToScVal } = sdk
  const server = new rpc.Server(SOROBAN_RPC_MAINNET)
  const account = await server.getAccount(MAINNET_SOURCE)

  const read = async (id: string, method: string, ...args: import('@stellar/stellar-sdk').xdr.ScVal[]) => {
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: Networks.PUBLIC,
    })
      .addOperation(new Contract(id).call(method, ...args))
      .setTimeout(30)
      .build()
    const sim = await server.simulateTransaction(tx)
    if (rpc.Api.isSimulationError(sim)) throw new Error(`${method}: ${sim.error}`)
    if (!sim.result) throw new Error(`${method}: no result`)
    return scValToNative(sim.result.retval)
  }
  const vaultById = (id: number) =>
    read(MAINNET_FACTORY, 'get_pool_by_id', nativeToScVal(BigInt(id), { type: 'u64' }))

  const [admin, poolCount] = await Promise.all([
    read(MAINNET_FACTORY, 'get_admin'),
    read(MAINNET_FACTORY, 'get_pool_count'),
  ])
  const newest = await vaultById(Number(poolCount))
  let placed = null
  // protocol 0 is Soroswap, the same read the positions page makes
  for (let id = Number(poolCount); id >= 1 && !placed; id--) {
    const v = id === Number(poolCount) ? newest : await vaultById(id)
    if (Number(await read(String(v.lobster_address), 'get_active_protocol')) === 0) placed = v
  }
  if (!placed) throw new Error('no mainnet vault has its tokens in Soroswap')
  return {
    admin: String(admin),
    poolCount: Number(poolCount),
    vault: String(newest.lobster_address),
    owner: String(newest.owner),
    placed: { vault: String(placed.lobster_address), owner: String(placed.owner) },
  }
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

  let truth: Truth

  test.beforeAll(async () => {
    truth = await readFactory()
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

  test('lists the newest vault with no wallet, and opens its owner read-only', async ({ page }) => {
    await openCustodyOnMainnet(page)
    const card = factoryCard(page)
    await expect(card.locator(`a[href$="/contract/${truth.vault}"]`)).toBeVisible({ timeout: 30_000 })
    await card.getByRole('button', { name: new RegExp(`Owner ${truth.owner.slice(0, 4)}`) }).first().click()
    await expect(page).toHaveURL(/\/positions/)
    await expect(page.getByRole('button', { name: 'Leave the read-only view' })).toBeVisible()
    await expect(page.locator(`a[href$="/contract/${truth.vault}"]`).first()).toBeVisible({ timeout: 30_000 })
  })

  test('a link opens mainnet on an account, read-only', async ({ page }) => {
    await page.goto(`${BASE}/positions?network=mainnet&view=${truth.placed.owner}`)
    await expect(page.getByRole('button', { name: 'Mainnet', exact: true })).toHaveClass(/text-green/)
    await expect(page.getByRole('button', { name: 'Leave the read-only view' })).toBeVisible()
    await expect(page.locator(`a[href$="/contract/${truth.placed.vault}"]`).first()).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText('Soroswap', { exact: true }).first()).toBeVisible()
  })

  test('a mainnet swap routes through soroswap, the broker only quotes', async ({ page }) => {
    await page.goto(`${BASE}/?network=mainnet&view=${truth.placed.owner}`)
    await page.getByRole('button', { name: 'Swap', exact: true }).click()
    await page.getByPlaceholder('0.0').fill('1')
    await expect(page.getByText('Direct via Soroswap')).toBeVisible({ timeout: 30_000 })
    const confirm = page.getByRole('button', { name: 'Confirm Soroswap swap' })
    await expect(confirm).toBeEnabled()
    await expect(page.getByText('Cannot be signed from here')).toHaveCount(0)
    // the read-only view stops the click before any wallet is asked
    await confirm.click()
    await expect(page.getByText(/read-only view of/i)).toBeVisible({ timeout: 30_000 })
  })
})
