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
    // Use the h3 heading to anchor on the Factory card only (the page
    // subtitle also contains the words "Factory contract").
    const card = page.getByRole('heading', { name: 'Factory contract' }).locator('..').locator('..')
    await expect(card).toContainText(shorten(truth.admin, 8))
  })

  test('Factory pool_count from on-chain matches the rendered Pools created', async ({ page }) => {
    await page.goto(`${BASE}/positions`)
    await expect(page.getByText(/Pools created/i)).toBeVisible({ timeout: 30_000 })
    // The "Pools created" label sits above the stat value in the same Stat block.
    const label = page.getByText(/^Pools created$/i)
    const value = label.locator('..').locator('div').nth(1)
    await expect(value).toHaveText(String(truth.poolCount))
  })

  test('Contract ID stat renders the testnet Factory address', async ({ page }) => {
    await page.goto(`${BASE}/positions`)
    await expect(page.getByText(/Contract ID/i)).toBeVisible({ timeout: 30_000 })
    const label = page.getByText(/^Contract ID$/i)
    const value = label.locator('..').locator('div').nth(1)
    await expect(value).toHaveText(shorten(FACTORY, 8))
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

  test('LiveDataMeta refresh button triggers a network call (Soroban RPC)', async ({ page }) => {
    let sorobanCalls = 0
    page.on('request', (req) => {
      if (req.url().includes('soroban-testnet.stellar.org')) sorobanCalls++
    })

    await page.goto(`${BASE}/positions`)
    await expect(page.getByText(/Pools created/i)).toBeVisible({ timeout: 30_000 })

    const callsBefore = sorobanCalls
    // First Refresh button is on the Factory card (rendered before the
    // Your-positions card which only mounts after wallet connect).
    const refreshBtn = page.getByRole('button', { name: /Refresh/i }).first()
    await refreshBtn.click()

    // Give react-query a tick to dispatch the refetch.
    await page.waitForTimeout(800)
    expect(sorobanCalls).toBeGreaterThan(callsBefore)
  })

  test('"updated ..." label appears, advances over time, and stays present', async ({ page }) => {
    await page.goto(`${BASE}/positions`)
    await expect(page.getByText(/Pools created/i)).toBeVisible({ timeout: 30_000 })

    // Capture the first age label, wait, capture again. The interval
    // re-renders once a second; "just now" should turn into "Xs ago" within 3 s.
    const ageNode = page.getByText(/^updated /).first()
    const first = await ageNode.textContent()
    await page.waitForTimeout(2200)
    const second = await ageNode.textContent()
    expect(first).toBeTruthy()
    expect(second).toBeTruthy()
    expect(second).not.toBe(first)
  })

  test('Switching network to mainnet hides the testnet Factory (UI reacts to context)', async ({ page }) => {
    await page.goto(`${BASE}/positions`)
    await expect(page.getByRole('heading', { name: 'Factory contract' })).toBeVisible({ timeout: 30_000 })

    await page.getByRole('button', { name: 'Mainnet' }).click()
    // The page should now show the "Not deployed on mainnet yet" branch.
    await expect(page.getByText(/not deployed on mainnet/i)).toBeVisible({
      timeout: 10_000,
    })
    // And the live testnet admin G-address should no longer be visible.
    await expect(page.locator(`text=${shorten(SOURCE, 8)}`)).toHaveCount(0)
  })

  test('Network toggle persists across reload (localStorage round-trip)', async ({ page, context }) => {
    await page.goto(BASE)
    await page.getByRole('button', { name: 'Mainnet' }).click()
    await page.waitForTimeout(150)

    const stored = await page.evaluate(() => localStorage.getItem('lob_network'))
    expect(stored).toBe('mainnet')

    // Hard reload - the stored value must survive and the TopBar must
    // come back with "Mainnet" already selected.
    await page.reload()
    const mainnetBtn = page.getByRole('button', { name: 'Mainnet' })
    await expect(mainnetBtn).toHaveClass(/text-green/)

    // Cleanup so we don't pollute the next test.
    await context.clearCookies()
    await page.evaluate(() => localStorage.removeItem('lob_network'))
  })
})

test.describe('Live Horizon reads match Activity and Balances', () => {
  test('OnChainActivityCard is silent when no wallet is connected (no Horizon call)', async ({ page }) => {
    let horizonCalls = 0
    page.on('request', (req) => {
      if (req.url().includes('horizon-testnet.stellar.org')) horizonCalls++
    })

    await page.goto(`${BASE}/activity`)
    await page.waitForLoadState('networkidle')

    // No wallet -> OnChainActivityCard returns null, no Horizon call.
    expect(horizonCalls).toBe(0)
  })
})
