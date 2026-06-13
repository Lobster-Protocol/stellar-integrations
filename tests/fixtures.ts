// shared playwright test fixtures. canonical values live in
// src/config/contracts.ts; we keep a small mirror here so the e2e specs
// stay self-contained without crossing tsconfig project boundaries.

import type { Page } from '@playwright/test'

// matches the baseURL in playwright.config.ts; exposed here for the few
// specs that use the request fixture (which does not auto-prepend baseURL)
// or that need absolute urls for redirect checks.
export const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'https://stellar-instit.lobster-protocol.com'

// soroban rpc target for on-chain integration specs. override per environment.
export const SOROBAN_RPC = process.env.PLAYWRIGHT_SOROBAN_RPC ?? 'https://soroban-testnet.stellar.org'

// mainnet harness. the deployed Factory C-address is NOT committed here - it
// comes from the env once the mainnet deploy lands, so the mainnet spec stays
// a blank harness (it skips) until then. MAINNET_SOURCE is any funded
// G-account used as the simulation source for read calls.
export const SOROBAN_RPC_MAINNET = process.env.PLAYWRIGHT_SOROBAN_RPC_MAINNET ?? 'https://mainnet.sorobanrpc.com'
export const MAINNET_FACTORY = process.env.PLAYWRIGHT_MAINNET_FACTORY ?? ''
export const MAINNET_SOURCE = process.env.PLAYWRIGHT_MAINNET_SOURCE ?? ''

export const TEST_WALLET = {
  address: 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU',
  name: 'Freighter',
} as const

// matches contracts.ts testnet.lobster
export const TEST_FACTORY_TESTNET = 'CACIPDGSEGB3C5FHINR3S5V6F7BMVH5IWVQ2U3BUHHTP4BVSRRPE2LXO'

// matches contracts.ts testnet.lobster.readSource (deployer)
export const TEST_SOURCE_TESTNET = 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU'

// must match shortenAddress in src/utils/format.ts: three ASCII dots, not the
// ellipsis character, so the DOM text the specs compare against lines up.
export function shorten(addr: string, n = 8): string {
  return `${addr.slice(0, n)}...${addr.slice(-n)}`
}

export async function seedWallet(page: Page) {
  await page.addInitScript(([addr, name]) => {
    localStorage.setItem('lob_addr', addr)
    localStorage.setItem('lob_wname', name)
  }, [TEST_WALLET.address, TEST_WALLET.name] as const)
}

// seedWallet + page.goto in one call, the most common pattern across the
// public specs. accepts a relative path that playwright prepends with the
// configured baseURL.
export async function gotoWithWallet(page: Page, path: string = '/') {
  await seedWallet(page)
  await page.goto(path, { waitUntil: 'networkidle' })
}
