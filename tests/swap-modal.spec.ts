import { test, expect } from '@playwright/test'

import { seedWallet } from './fixtures'

test.describe('SwapModal - Stellar Broker wiring', () => {
  test('opens from the Overview Swap button and shows the asset form', async ({ page }) => {
    await seedWallet(page)
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Swap' }).click()

    await expect(page.getByText('Best-execution swap')).toBeVisible()
    await expect(page.getByText('Selling')).toBeVisible()
    await expect(page.getByText('Buying')).toBeVisible()
    await expect(page.getByPlaceholder('0.0')).toBeVisible()
  })

  test('shows the differ message when selling and buying are identical', async ({ page }) => {
    await seedWallet(page)
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Swap' }).click()

    // form has two <select>s; flip buying to XLM so it matches selling
    await page.locator('select').nth(1).selectOption('XLM')

    await expect(page.getByText('Selling and buying must differ.')).toBeVisible()
    // confirm buttons (broker or fallback) must not appear when the form is invalid
    await expect(page.getByRole('button', { name: /Confirm (broker|Soroswap) swap/ })).toHaveCount(0)
  })

  test('does not show a confirm button without an amount', async ({ page }) => {
    await seedWallet(page)
    await page.goto('/', { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Swap' }).click()

    await expect(page.getByRole('button', { name: /Confirm (broker|Soroswap) swap/ })).toHaveCount(0)
  })
})
