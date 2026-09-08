import { test, expect } from '@playwright/test'

import { seedWallet } from './fixtures'

test.describe('the custody page', () => {
  test('renders the audit chrome with all the custody panels', async ({ page }) => {
    await seedWallet(page)
    await page.goto('/audit', { waitUntil: 'domcontentloaded' })

    // these render regardless of api wiring
    await expect(page.getByText('Institutional custody through DFNS')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'DFNS custody' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Signing activity/ })).toBeVisible()

    // every custody panel now names itself in both states, so the titles no
    // longer separate a live panel from an off one. the bundle carries the
    // relay url from build-time env this process cannot read, so decide on the
    // one thing only the off state prints.
    // the panels decide their own state once the relay answers, so anchor on a
    // title before counting: reading the marker too early made the two tests
    // disagree about the same page.
    await expect(page.getByText('DFNS wallets')).toBeVisible()
    const off = page.getByText(/Connect a DFNS organization to see this/)
    const wired = (await off.count()) === 0

    await expect(page.getByText('DFNS wallets')).toBeVisible()
    await expect(page.getByText('Signing policies')).toBeVisible()
    await expect(page.getByText('Pending approvals')).toBeVisible()
    await expect(page.getByText('MiCA audit export')).toBeVisible()

    if (wired) {
      // live panels carry their own controls and counts
      await expect(page.getByRole('button', { name: /Download JSON/i })).toBeVisible()
      await expect(page.getByText(/^\d+ total$/)).toBeVisible()
    } else {
      await expect(off.first()).toBeVisible()
      // the MiCA panel keeps its button in both states and explains the gap
      // itself, so its absence is not what marks an unwired page
      await expect(page.getByText(/no relay to ask for the records/i).first()).toBeVisible()
    }
  })

  test('MPC feed shows a waiting state until an event arrives', async ({ page }) => {
    await seedWallet(page)
    await page.goto('/audit', { waitUntil: 'domcontentloaded' })

    // the panels decide their own state once the relay answers, so anchor on a
    // title before counting: reading the marker too early made the two tests
    // disagree about the same page.
    await expect(page.getByText('DFNS wallets')).toBeVisible()
    const off = page.getByText(/Connect a DFNS organization to see this/)
    if ((await off.count()) > 0) {
      // no relay to stream from, and the feed says exactly that
      await expect(page.getByRole('heading', { name: /Signing activity/ })).toBeVisible()
      await expect(page.getByText('0 events')).toHaveCount(0)
      return
    }

    // nothing has been signed in this browser, so the feed sits at zero and
    // carries no event rows. the count is the assertion; the empty-state
    // wording is the component's to change.
    await expect(page.getByText('0 events')).toBeVisible()
    await expect(page.getByRole('heading', { name: /Signing activity/ })).toBeVisible()
  })
})
