import { test, expect } from '@playwright/test'
import { Account, TransactionBuilder, Operation, Asset, Keypair, Networks } from '@stellar/stellar-sdk'

import { gotoWithWallet, TEST_WALLET } from './fixtures'

// the co-sign card renders with no network read, so it is the stable anchor for
// a smoke test. the setup card above it reads the account's signers from Horizon,
// which is covered by the module's unit tests and the on-chain proof, not here.

test.describe('shared control', () => {
  test('renders the co-sign card at /shared-control', async ({ page }) => {
    // shared control is an advanced route, off the main nav; reached directly.
    await gotoWithWallet(page, '/shared-control')
    await expect(page).toHaveURL(/\/shared-control$/)

    await expect(page.getByRole('heading', { level: 2, name: 'Shared control' })).toBeVisible()
    await expect(page.getByText('Finish a shared transaction')).toBeVisible()
    await expect(page.getByPlaceholder('Paste the transaction here')).toBeVisible()
  })

  test('the co-sign card rejects text that is not a transaction', async ({ page }) => {
    await gotoWithWallet(page, '/shared-control')
    await page.getByPlaceholder('Paste the transaction here').fill('not-an-xdr')
    await page.getByRole('button', { name: /^Load$/ }).click()
    await expect(page.getByText(/does not read as a transaction/i)).toBeVisible()
  })

  test('the co-sign card warns when an operation pays from a different account', async ({ page }) => {
    // the review's multi-source hijack: the tx source is the account under review,
    // but a hidden operation sends from another account P to the attacker Z. the
    // decoder must show it so the co-signer is not signing blind.
    const P = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 7)).publicKey()
    const Z = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 8)).publicKey()
    const src = new Account(TEST_WALLET.address, '100')
    const hijack = new TransactionBuilder(src, { fee: '1000', networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.payment({ source: P, destination: Z, asset: Asset.native(), amount: '9000' }))
      .setTimeout(300)
      .build()
      .toXDR()

    await gotoWithWallet(page, '/shared-control')
    await page.getByPlaceholder('Paste the transaction here').fill(hijack)
    await page.getByRole('button', { name: /^Load$/ }).click()

    await expect(page.getByText('What you are approving')).toBeVisible()
    await expect(page.getByText(/not this account/)).toBeVisible()

    // the danger blocks signing until the co-signer acknowledges what they saw
    const signBtn = page.getByRole('button', { name: /Sign your part/ })
    await expect(signBtn).toBeDisabled()
    await page.getByLabel(/I have read what this transaction does/).check()
    await expect(signBtn).toBeEnabled()
  })
})
