import { test, expect, type Page } from '@playwright/test'

// After a deploy the host only serves the new build. A tab opened before asks for one of the
// old files when it opens a page it had not shown, and gets the site's HTML back with a 200,
// the way Vercel answers it

const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Main' }).first()
const positionsFile = /\/assets\/Positions-[\w-]+\.js$/

async function openBeforeTheDeploy(page: Page) {
  await page.goto('/', { waitUntil: 'load' })
  await expect(sidebar(page)).toBeVisible()
  const html = await (await page.request.get('/')).text()
  const deploy = { stale: true }
  await page.route(positionsFile, (route) =>
    deploy.stale ? route.fulfill({ status: 200, contentType: 'text/html', body: html }) : route.continue(),
  )
  // gone once the page is loaded again
  await page.evaluate(() => {
    document.documentElement.dataset.openedBefore = '1'
  })
  return deploy
}

test.describe('a tab left open across a deploy', () => {
  test('opens a page it had not shown on the new version', async ({ page }) => {
    const deploy = await openBeforeTheDeploy(page)
    // the next document the tab loads comes with the new build
    page.on('request', (r) => {
      if (r.isNavigationRequest() && r.frame() === page.mainFrame()) deploy.stale = false
    })
    await sidebar(page).getByRole('link', { name: 'Positions', exact: true }).click()
    await expect(page.locator('html[data-opened-before]')).toHaveCount(0)
    await expect(page).toHaveURL(/\/positions$/)
    await expect(page.getByRole('heading', { name: 'Positions' })).toBeVisible()
    await expect(page.getByText('Something went wrong')).toHaveCount(0)
  })

  test('says the page was updated when loading it again did not help, and does not loop', async ({ page }) => {
    const deploy = await openBeforeTheDeploy(page)
    await sidebar(page).getByRole('link', { name: 'Positions', exact: true }).click()
    // loaded once more, still without the file: it stops there and says what to do
    await expect(page.locator('html[data-opened-before]')).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'This page was updated' })).toBeVisible()
    await expect(page.getByText(/new version went live while this tab was open/)).toBeVisible()
    deploy.stale = false
    await page.getByRole('button', { name: 'Reload' }).click()
    await expect(page.getByRole('heading', { name: 'Positions' })).toBeVisible()
  })
})
