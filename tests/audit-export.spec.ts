import { test, expect } from '@playwright/test'

import { seedWallet } from './fixtures'

// the export button is only mounted when the lobster api url is built into the
// bundle (VITE_ is inlined at build). when it is, this drives the whole
// download path: click -> token-gated fetch -> blob -> file, and checks the
// payload is a valid mica record chain. the backend response is mocked here
// because the real export needs the dfns relay deployed.
const apiUrl = process.env.VITE_LOBSTER_API_URL
const apiToken = process.env.VITE_LOBSTER_API_TOKEN

type ExportedRecord = { prevRecordHash: string | null; recordHash: string; transactionReference: string }

test.describe('MiCA audit export download', () => {
  test.skip(!apiUrl, 'set VITE_LOBSTER_API_URL to exercise the export download')

  test('downloads a continuous mica record chain from the audit page', async ({ page }) => {
    const records: ExportedRecord[] = [
      { prevRecordHash: null, recordHash: 'h1', transactionReference: 'a'.repeat(64) },
      { prevRecordHash: 'h1', recordHash: 'h2', transactionReference: 'b'.repeat(64) },
    ]
    let tokenHeader: string | undefined
    await page.route('**/dfns/audit/export', (route) => {
      tokenHeader = route.request().headers()['x-lobster-token']
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ records }),
      })
    })

    await seedWallet(page)
    // not networkidle: with the api url set the MpcSignatureFeed holds an SSE
    // connection open, so the network never goes idle.
    await page.goto('/audit', { waitUntil: 'domcontentloaded' })

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: /Download JSON/i }).click()
    const download = await downloadPromise

    expect(download.suggestedFilename()).toMatch(/^mica-export-\d{4}-\d{2}-\d{2}\.json$/)

    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const c of stream) chunks.push(c as Buffer)
    const parsed = JSON.parse(Buffer.concat(chunks).toString()) as { records: ExportedRecord[] }

    expect(parsed.records).toHaveLength(2)
    expect(parsed.records[0].prevRecordHash).toBeNull()
    expect(parsed.records[1].prevRecordHash).toBe(parsed.records[0].recordHash)

    // the export is token-gated; the button forwards the bundle token when it
    // has one, so a configured deploy never hits the endpoint unauthenticated
    if (apiToken) expect(tokenHeader).toBe(apiToken)
  })
})
