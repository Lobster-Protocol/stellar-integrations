import { test, expect } from '@playwright/test'
import { TransactionBuilder, Networks } from '@stellar/stellar-sdk'

import { seedDfnsDemo, seedWallet, TEST_SOURCE_TESTNET } from './fixtures'

// dfns is mocked, but building the tx still hits live testnet rpc
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
        // dfns broadcasts a classic tx itself and the relay reports the hash
        body: req.method() === 'OPTIONS' ? '' : JSON.stringify({ txHash: 'a'.repeat(64) }),
      })
    })

    await seedDfnsDemo(page)
    await seedWallet(page)
    await page.addInitScript(() => localStorage.setItem('lob_custody_mode', 'dfns'))
    // the wallet poll never lets the network go idle
    await page.goto('/audit', { waitUntil: 'domcontentloaded' })

    // only the raw-xdr payment reaches /dfns/sign. its twin has the relay build the tx
    const btn = page.getByRole('button', { name: /raw XDR/i })
    await expect(btn).toBeVisible()

    const signReq = page.waitForRequest((req) => req.url().includes('/dfns/sign') && req.method() === 'POST')
    await btn.click()
    const signBody = (await signReq).postDataJSON() as { xdr?: string; networkPassphrase?: string }

    expect(typeof signBody.xdr).toBe('string')
    expect(signBody.xdr!.length).toBeGreaterThan(0)
    // the relay refuses a passphrase that doesn't match its own network
    expect(signBody.networkPassphrase).toContain('Test SDF Network')

    // the relay guard only signs txs sourced from the treasury, not the browser wallet
    const built = TransactionBuilder.fromXDR(signBody.xdr!, Networks.TESTNET)
    expect(built.source).toBe(TEST_SOURCE_TESTNET)
  })
})
