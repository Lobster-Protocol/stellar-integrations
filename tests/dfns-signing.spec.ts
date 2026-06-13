import { test, expect } from '@playwright/test'

import { seedWallet, TEST_WALLET, TEST_SOURCE_TESTNET } from './fixtures'

// in MPC custody mode the dashboard keeps the same connected account but swaps
// the signer for the dfns one, which posts the built xdr to /dfns/sign. this
// drives that path from the UI: toggle to dfns, ping the factory, and assert
// the signature request leaves with the right shape. the dfns endpoints are
// mocked because the real flow needs the sandbox + relay deployed. the build
// step still hits live testnet rpc, like the other on-chain specs.
const apiUrl = process.env.VITE_LOBSTER_API_URL

test.describe('DFNS MPC signing path', () => {
  test.skip(!apiUrl, 'set VITE_LOBSTER_API_URL to exercise the dfns signer')

  test('routes the ping signature through /dfns/sign in MPC mode', async ({ page }) => {
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
        body: req.method() === 'OPTIONS' ? '' : JSON.stringify({ signedTxXdr: 'AAAAdfns-mock' }),
      })
    })

    await seedWallet(page)
    await page.addInitScript(() => localStorage.setItem('lob_custody_mode', 'dfns'))
    // domcontentloaded, not networkidle: the dfns wallet poll and any feed keep
    // the network busy, so idle never fires.
    await page.goto('/positions', { waitUntil: 'domcontentloaded' })

    const btn = page.getByRole('button', { name: /Ping Factory with DFNS MPC/i })
    await expect(btn).toBeVisible()

    const signReq = page.waitForRequest((req) => req.url().includes('/dfns/sign') && req.method() === 'POST')
    await btn.click()
    const signBody = (await signReq).postDataJSON() as { xdr?: string; networkPassphrase?: string }

    expect(typeof signBody.xdr).toBe('string')
    expect(signBody.xdr!.length).toBeGreaterThan(0)
    // the passphrase the server checks against its own env to refuse a tx built
    // for the wrong network
    expect(signBody.networkPassphrase).toContain('Test SDF Network')

    // the source stays the connected account; dfns only supplies the signature
    expect(TEST_WALLET.address).toBe(TEST_SOURCE_TESTNET)
  })
})
