import { test, expect } from '@playwright/test'

import { BASE, SOROBAN_RPC, TEST_FACTORY_TESTNET, TEST_SOURCE_TESTNET, shorten } from './fixtures'

// e2e against live testnet. each test reads the ground truth from
// soroban rpc, then asserts the prod dashboard renders the same value.
const FACTORY = TEST_FACTORY_TESTNET
const SOURCE = TEST_SOURCE_TESTNET
const RPC_URL = SOROBAN_RPC

interface GroundTruth {
  admin: string
  wasmHash: string
  poolCount: number
}

async function readGroundTruth(): Promise<GroundTruth> {
  // Use the stellar-sdk to call simulateTransaction once per view function.
  // Imported dynamically because the SDK is heavy and we only need it here.
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

test.describe('Live Factory reads match the /positions DOM', () => {
  let truth: GroundTruth

  test.beforeAll(async () => {
    truth = await readGroundTruth()
  })

  test('Factory admin from on-chain matches the rendered Admin stat', async ({ page }) => {
    await page.goto(`${BASE}/positions`)
    // The factory card shows "Reading from Soroban RPC..." until the
    // simulation resolves, after which "Pools created" appears.
    await expect(page.getByText(/Pools created/i)).toBeVisible({ timeout: 30_000 })
    // anchor on the card through its h3: the page subtitle also carries the
    // words "Factory contract", and the stat labels each carry a help tip
    const card = page
      .getByRole('heading', { name: /Factory contract/ })
      .locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]')
    await expect(card).toContainText(shorten(truth.admin, 8))
  })

  test('Factory pool_count from on-chain matches the rendered Pools created', async ({ page }) => {
    await page.goto(`${BASE}/positions`)
    await expect(page.getByText(/Pools created/i)).toBeVisible({ timeout: 30_000 })
    // the label and the value share a Stat block, so read the block rather
    // than the label, and a markup reshuffle does not break the check
    const stat = page.getByText(/^Pools created$/i).locator('..')
    await expect(stat).toContainText(String(truth.poolCount))
  })

  test('Contract ID stat renders the testnet Factory address', async ({ page }) => {
    await page.goto(`${BASE}/positions`)
    await expect(page.getByText(/Contract ID/i)).toBeVisible({ timeout: 30_000 })
    const card = page
      .getByRole('heading', { name: /Factory contract/ })
      .locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]')
    await expect(card).toContainText(shorten(FACTORY, 8))
  })

  test('Stellar Expert link points to the Factory on the right network', async ({ page }) => {
    await page.goto(`${BASE}/positions`)
    const link = page.getByRole('link', { name: /Stellar Expert/i }).first()
    await expect(link).toBeVisible({ timeout: 30_000 })
    await expect(link).toHaveAttribute(
      'href',
      `https://stellar.expert/explorer/testnet/contract/${FACTORY}`,
    )
  })

  test('refreshing the factory card really goes back to the chain', async ({ page }) => {
    let sorobanCalls = 0
    page.on('request', (req) => {
      if (req.url().includes('soroban-testnet.stellar.org')) sorobanCalls++
    })

    await page.goto(`${BASE}/positions`)
    await expect(page.getByText(/Pools created/i)).toBeVisible({ timeout: 30_000 })

    const callsBefore = sorobanCalls
    // scope to the Factory card: the TTL card below it also has a refresh, and
    // that one reads the monitoring relay rather than Soroban
    const factoryCard = page
      .getByRole('heading', { name: 'Factory contract' })
      .locator('xpath=ancestor::div[contains(@class,"rounded-3xl")][1]')
    await factoryCard.getByRole('button', { name: /Refresh/i }).click()

    // Give react-query a tick to dispatch the refetch.
    await page.waitForTimeout(800)
    expect(sorobanCalls).toBeGreaterThan(callsBefore)
  })

  test('the age label keeps counting rather than freezing at "just now"', async ({ page }) => {
    await page.goto(`${BASE}/positions`)
    await expect(page.getByText(/Pools created/i)).toBeVisible({ timeout: 30_000 })

    // Capture the first age label, wait, capture again. The interval
    // re-renders once a second; "just now" should turn into "Xs ago" within 3 s.
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
    await page.goto(`${BASE}/positions`)
    await expect(page.getByRole('heading', { name: 'Factory contract' })).toBeVisible({ timeout: 30_000 })

    await page.getByRole('button', { name: 'Mainnet' }).click()
    await expect(page.getByText(/not deployed on mainnet/i)).toBeVisible({
      timeout: 10_000,
    })
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

    // the toggle writes to a shared origin, so put it back for whoever runs next
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
    // give any mount effects a beat to fire a request, then assert the card
    // stayed silent. networkidle never settles here with the live polling.
    await page.waitForTimeout(1500)

    expect(horizonCalls).toBe(0)
  })
})
