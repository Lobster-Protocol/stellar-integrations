import { test, expect } from '@playwright/test'

import { gotoWithWallet } from './fixtures'

test.describe('the swap form', () => {
  test('opens from the Overview Swap button and shows the asset form', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('button', { name: 'Swap' }).click()

    await expect(page.getByText('Best-execution swap')).toBeVisible()
    await expect(page.getByText('Selling')).toBeVisible()
    await expect(page.getByText('Buying')).toBeVisible()
    await expect(page.getByPlaceholder('0.0')).toBeVisible()
  })

  test('refuses the same asset on both sides', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('button', { name: 'Swap' }).click()

    // the second select is buying, and selling is already XLM
    await page.locator('select').nth(1).selectOption('XLM')

    await expect(page.getByText('Selling and buying must differ.')).toBeVisible()
    await expect(page.getByRole('button', { name: /Confirm Soroswap swap/ })).toHaveCount(0)
  })

  test('does not show a confirm button without an amount', async ({ page }) => {
    await gotoWithWallet(page)
    await page.getByRole('button', { name: 'Swap' }).click()

    await expect(page.getByRole('button', { name: /Confirm Soroswap swap/ })).toHaveCount(0)
  })
})
