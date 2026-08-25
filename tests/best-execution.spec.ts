import { test, expect, type Page } from '@playwright/test'

import { BROKER_ENDPOINT, MAINNET_USDC_ISSUER, seedWallet } from './fixtures'

// D3 is sold on best execution across venues, so the acceptance test is: the
// dashboard shows what the broker actually answered, next to the direct route,
// and the two figures match a quote this spec fetched for itself.
const PROBE_XLM = 100

interface Quote {
  status: string
  estimatedBuyingAmount?: string
  directTrade?: { buying: string }
  profit?: string
}

// The ground truth comes from a third party, so a slow or missing broker has to
// read as "nothing to compare against" and skip. Letting it throw would turn a
// quiet market into a red build.
async function liveQuote(): Promise<Quote> {
  const url =
    `${BROKER_ENDPOINT}/quote?sellingAsset=XLM&buyingAsset=USDC-${MAINNET_USDC_ISSUER}` +
    `&sellingAmount=${PROBE_XLM}&slippageTolerance=0.02`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
    if (!res.ok) return { status: `http ${res.status}` }
    return (await res.json()) as Quote
  } catch (err) {
    return { status: `unreachable: ${(err as Error).message}` }
  }
}

async function openSwapWithAmount(page: Page, amount: string) {
  await seedWallet(page)
  await page.addInitScript(() => localStorage.setItem('lob_network', 'mainnet'))
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('button', { name: 'Swap', exact: true }).first()).toBeVisible({
    timeout: 20000,
  })
  await page.getByRole('button', { name: 'Swap', exact: true }).first().click()
  await expect(page.getByText('Best-execution swap')).toBeVisible({ timeout: 15000 })
  await page.locator('input[inputmode="decimal"]').first().fill(amount)
}

function shown(body: string, label: string): number | null {
  const m = new RegExp(`${label}\\s+([\\d.]+)\\s+USDC`).exec(body)
  return m ? Number(m[1]) : null
}

test.describe('best execution', () => {
  test('shows the broker quote beside the direct route, and it matches the live quote', async ({
    page,
  }) => {
    const truth = await liveQuote()
    test.skip(truth.status !== 'success', `broker has no quote right now: ${truth.status}`)

    await openSwapWithAmount(page, String(PROBE_XLM))
    // the price tile also carries the words "via Stellar Broker" and getByText
    // ignores case, so wait on a line only the quote block has
    await expect(page.getByText('Direct route, same size')).toBeVisible({ timeout: 45000 })
    await expect(page.getByText(/^Via Stellar Broker$/)).toBeVisible()
    await expect(page.getByText('Extra vs direct route')).toBeVisible()

    const body = await page.locator('body').innerText()
    const broker = shown(body, 'Via Stellar Broker')
    const direct = shown(body, 'Direct route, same size')
    expect(broker).not.toBeNull()
    expect(direct).not.toBeNull()

    // the page quotes a moment after this spec did, so allow for market drift
    // while still proving it is the same number and not a placeholder
    const expected = Number(truth.estimatedBuyingAmount)
    expect(Math.abs(broker! - expected) / expected).toBeLessThan(0.05)
    expect(broker!).toBeGreaterThanOrEqual(direct!)
  })

  test('keeps the comparison on screen whichever route wins', async ({ page }) => {
    const truth = await liveQuote()
    test.skip(truth.status !== 'success', `broker has no quote right now: ${truth.status}`)

    await openSwapWithAmount(page, String(PROBE_XLM))
    await expect(page.getByText('Direct route, same size')).toBeVisible({ timeout: 45000 })

    // three ways this can end: the broker leg is executable, the swap falls back
    // to Soroswap, or nothing on the pair can be signed. the comparison has to
    // survive all three, and the page has to say which one it is.
    const broker = page.getByText('Live best-execution quote from Stellar Broker')
    const fallback = page.getByRole('button', { name: /^Confirm/ })
    const reference = page.getByText('Nothing on this pair can be signed from here right now.')
    const stated =
      (await broker.count()) + (await fallback.count()) + (await reference.count())
    expect(stated).toBeGreaterThan(0)
  })

  test('asks for a price the broker will actually quote', async ({ page }) => {
    const asked: string[] = []
    page.on('request', (r) => {
      if (!r.url().includes('/quote')) return
      const amount = new URL(r.url()).searchParams.get('sellingAmount')
      if (amount) asked.push(amount)
    })

    await seedWallet(page)
    await page.addInitScript(() => localStorage.setItem('lob_network', 'mainnet'))
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('XLM price')).toBeVisible({ timeout: 20000 })
    await page.waitForTimeout(6000)

    // one XLM is worth cents and the broker refuses anything under a dollar, so
    // a probe that size would leave the whole mainnet view priceless
    expect(asked.length).toBeGreaterThan(0)
    expect(asked).not.toContain('1')
  })

  test('a wallet on mainnet gets a price rather than n/a', async ({ page }) => {
    const truth = await liveQuote()
    test.skip(truth.status !== 'success', `broker has no quote right now: ${truth.status}`)

    await seedWallet(page)
    await page.addInitScript(() => localStorage.setItem('lob_network', 'mainnet'))
    await page.goto('/', { waitUntil: 'domcontentloaded' })

    const tile = page
      .getByText('XLM price')
      .locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]')
    await expect(tile).toBeVisible({ timeout: 20000 })
    await expect(tile).toContainText('via Stellar Broker', { timeout: 30000 })

    const unit = Number(truth.estimatedBuyingAmount) / PROBE_XLM
    const text = await tile.innerText()
    const value = Number(/(\d+\.\d+)/.exec(text)?.[1])
    expect(Number.isFinite(value)).toBe(true)
    expect(Math.abs(value - unit) / unit).toBeLessThan(0.05)
  })
})
