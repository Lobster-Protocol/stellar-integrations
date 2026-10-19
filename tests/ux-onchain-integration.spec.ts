import { test, expect } from '@playwright/test'

import { BASE, SOROBAN_RPC, TEST_FACTORY_TESTNET, TEST_SOURCE_TESTNET, shorten } from './fixtures'

// reads ground truth from testnet soroban rpc and expects the page to show the same
const FACTORY = TEST_FACTORY_TESTNET
const SOURCE = TEST_SOURCE_TESTNET
const RPC_URL = SOROBAN_RPC

interface GroundTruth {
  admin: string
  wasmHash: string
  poolCount: number
}

async function readGroundTruth(): Promise<GroundTruth> {
  const sdk = await import('@stellar/stellar-sdk')
  const { Contract, TransactionBuilder, BASE_FEE, Networks, rpc, scValToNative } = sdk
  const server = new rpc.Server(RPC_URL)
  const contract = new Contract(FACTORY)
  const account = await server.getAccount(SOURCE)

  const read = async (method: string) => {
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(contract.call(method))
      .setTimeout(30)
      .build()
    const sim = await server.simulateTransaction(tx)
    if (rpc.Api.isSimulationError(sim)) throw new Error(`${method}: ${sim.error}`)
    if (!sim.result) throw new Error(`${method}: no result`)
    return scValToNative(sim.result.retval)
  }

  const [admin, wasmRaw, poolCount] = await Promise.all([
    read('get_admin'),
    read('get_wasm_hash'),
    read('get_pool_count'),
  ])
  const wasmHash = Buffer.isBuffer(wasmRaw)
    ? (wasmRaw as Buffer).toString('hex')
    : String(wasmRaw)
  return { admin: String(admin), wasmHash, poolCount: Number(poolCount) }
}

test.describe('Live Factory reads match the /audit DOM', () => {
  let truth: GroundTruth

  test.beforeAll(async () => {
    truth = await readGroundTruth()
  })

  test('Factory admin from on-chain matches the rendered Admin stat', async ({ page }) => {
    await page.goto(`${BASE}/audit`)
    // "Pools created" only shows once the simulation resolves
    await expect(page.getByText(/Pools created/i)).toBeVisible({ timeout: 30_000 })
    // anchor on the card's h3. Contract ID and Admin have help tips in their labels
    const card = page
      .getByRole('heading', { name: /Factory contract/ })
      .locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]')
    await expect(card).toContainText(shorten(truth.admin, 8))
  })

  test('Factory pool_count from on-chain matches the rendered Pools created', async ({ page }) => {
    await page.goto(`${BASE}/audit`)
    await expect(page.getByText(/Pools created/i)).toBeVisible({ timeout: 30_000 })
    // label and value share one Stat block
    const stat = page.getByText(/^Pools created$/i).locator('..')
    await expect(stat).toContainText(String(truth.poolCount))
  })

  test('Contract ID stat renders the testnet Factory address', async ({ page }) => {
    await page.goto(`${BASE}/audit`)
    await expect(page.getByText(/Contract ID/i)).toBeVisible({ timeout: 30_000 })
    const card = page
      .getByRole('heading', { name: /Factory contract/ })
      .locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]')
    await expect(card).toContainText(shorten(FACTORY, 8))
  })

  test('Stellar Expert link points to the Factory on the right network', async ({ page }) => {
    await page.goto(`${BASE}/audit`)
    const link = page.getByRole('link', { name: /Stellar Expert/i }).first()
    await expect(link).toBeVisible({ timeout: 30_000 })
    await expect(link).toHaveAttribute(
      'href',
      `https://stellar.expert/explorer/testnet/contract/${FACTORY}`,
    )
  })

  test('refresh goes back to the chain', async ({ page }) => {
    let sorobanCalls = 0
    page.on('request', (req) => {
      if (req.url().includes('soroban-testnet.stellar.org')) sorobanCalls++
    })

    await page.goto(`${BASE}/audit`)
    await expect(page.getByText(/Pools created/i)).toBeVisible({ timeout: 30_000 })

    const callsBefore = sorobanCalls
    // the TTL card below also has a refresh, and that one reads the relay, not Soroban
    const factoryCard = page
      .getByRole('heading', { name: 'Factory contract' })
      .locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]')
    await factoryCard.getByRole('button', { name: /Refresh/i }).click()

    // give react-query a tick to send the refetch
    await page.waitForTimeout(800)
    expect(sorobanCalls).toBeGreaterThan(callsBefore)
  })

  test('the age label keeps counting', async ({ page }) => {
    await page.goto(`${BASE}/audit`)
    await expect(page.getByText(/Pools created/i)).toBeVisible({ timeout: 30_000 })

    // the label re-renders once a second, so the seconds have moved on by the second read
    const factoryCard = page
      .getByRole('heading', { name: 'Factory contract' })
      .locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]')
    const ageNode = factoryCard.getByText(/^updated /).first()
    const first = await ageNode.textContent()
    await page.waitForTimeout(2200)
    const second = await ageNode.textContent()
    expect(first).toBeTruthy()
    expect(second).toBeTruthy()
    expect(second).not.toBe(first)
  })

  test('switching to mainnet stops showing the testnet factory', async ({ page }) => {
    await page.goto(`${BASE}/audit`)
    // the storage card further down says the same, so read it inside the factory card
    const card = page
      .getByRole('heading', { name: 'Factory contract' })
      .locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]')
    await expect(card).toBeVisible({ timeout: 30_000 })

    await page.getByRole('button', { name: 'Mainnet' }).click()
    await expect(card.getByRole('link', { name: 'Stellar Expert' })).toHaveAttribute(
      'href',
      /\/explorer\/public\/contract\/C[A-Z2-7]{55}$/,
      { timeout: 10_000 },
    )
    await expect(card).not.toContainText(shorten(FACTORY, 8))
    await expect(page.locator(`text=${shorten(SOURCE, 8)}`)).toHaveCount(0)
  })

  test('the network choice survives a reload', async ({ page, context }) => {
    await page.goto(BASE)
    await page.getByRole('button', { name: 'Mainnet' }).click()
    await page.waitForTimeout(150)

    const stored = await page.evaluate(() => localStorage.getItem('lob_network'))
    expect(stored).toBe('mainnet')

    await page.reload()
    const mainnetBtn = page.getByRole('button', { name: 'Mainnet' })
    await expect(mainnetBtn).toHaveClass(/text-green/)

    await context.clearCookies()
    await page.evaluate(() => localStorage.removeItem('lob_network'))
  })
})

test.describe('Activity with no wallet connected', () => {
  test('makes no Horizon call at all', async ({ page }) => {
    let horizonCalls = 0
    page.on('request', (req) => {
      if (req.url().includes('horizon-testnet.stellar.org')) horizonCalls++
    })

    await page.goto(`${BASE}/activity`, { waitUntil: 'domcontentloaded' })
    // networkidle never settles here because the page keeps polling
    await page.waitForTimeout(1500)

    expect(horizonCalls).toBe(0)
  })
})
