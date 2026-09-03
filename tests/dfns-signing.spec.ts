import { test, expect } from '@playwright/test'
import { TransactionBuilder, Networks } from '@stellar/stellar-sdk'

import { seedWallet, TEST_SOURCE_TESTNET } from './fixtures'

// MPC custody mode swaps in the dfns signer, which posts the built xdr to
// /dfns/sign. the dfns endpoints are mocked (the real flow needs the sandbox +
// relay); the build step still hits live testnet rpc, like the other on-chain specs.
const apiUrl = process.env.VITE_LOBSTER_API_URL

test.describe('DFNS MPC signing path', () => {
  test.skip(!apiUrl, 'set VITE_LOBSTER_API_URL to exercise the dfns signer')

  test('routes the treasury signature through /dfns/sign in MPC mode', async ({ page }) => {
    // a matching testnet wallet so the custody context resolves a dfns address
    await page.route('**/dfns/wallets', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [{ id: 'wa-1', address: TEST_SOURCE_TESTNET, name: 'lobster-testnet', network: 'StellarTestnet' }],
        }),
      }),
    )

    // the cross-origin POST is preceded by a preflight OPTIONS (custom header +
    // credentials), which has no body, so fulfill that too and only assert on
    // the POST.
    await page.route('**/dfns/sign', (route) => {
      const req = route.request()
      route.fulfill({
        status: req.method() === 'OPTIONS' ? 204 : 200,
        contentType: 'application/json',
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST,OPTIONS',
          'access-control-allow-headers': 'content-type,x-lobster-token',
        },
        // a classic tx: dfns broadcasts it and the relay reports the hash.
        body: req.method() === 'OPTIONS' ? '' : JSON.stringify({ txHash: 'a'.repeat(64) }),
      })
    })

    await seedWallet(page)
    await page.addInitScript(() => localStorage.setItem('lob_custody_mode', 'dfns'))
    // domcontentloaded, not networkidle: the dfns wallet poll and any feed keep
    // the network busy, so idle never fires.
    await page.goto('/positions', { waitUntil: 'domcontentloaded' })

    // the under-limit payment is the one this spec is about: the dashboard
    // builds the xdr and hands it to /dfns/sign. its neighbour of the same
    // amount asks the relay to build and send the transfer itself, which never
    // touches this endpoint. an older wording ("Sign a treasury payment with
    // DFNS MPC") matched no button at all, so the spec died on the locator
    // rather than on the signing path it exists to cover.
    const btn = page.getByRole('button', { name: /under the limit/i })
    await expect(btn).toBeVisible()

    const signReq = page.waitForRequest((req) => req.url().includes('/dfns/sign') && req.method() === 'POST')
    await btn.click()
    const signBody = (await signReq).postDataJSON() as { xdr?: string; networkPassphrase?: string }

    expect(typeof signBody.xdr).toBe('string')
    expect(signBody.xdr!.length).toBeGreaterThan(0)
    // the passphrase the server checks against its own env to refuse a tx built
    // for the wrong network
    expect(signBody.networkPassphrase).toContain('Test SDF Network')

    // the built tx must source from the dfns treasury wallet the relay guard
    // requires, not whatever browser account happens to be connected
    const built = TransactionBuilder.fromXDR(signBody.xdr!, Networks.TESTNET)
    expect(built.source).toBe(TEST_SOURCE_TESTNET)
  })
})
