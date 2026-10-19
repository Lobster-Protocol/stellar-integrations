// copies of values in src/config/contracts.ts, so the specs stay self-contained

import type { Page } from '@playwright/test'

// matches the baseURL in playwright.config.ts, for specs that need the absolute url
export const BASE = process.env.PLAYWRIGHT_BASE_URL ?? 'https://stellar-instit.lobster-protocol.com'

export const SOROBAN_RPC = process.env.PLAYWRIGHT_SOROBAN_RPC ?? 'https://soroban-testnet.stellar.org'

export const SOROBAN_RPC_MAINNET = process.env.PLAYWRIGHT_SOROBAN_RPC_MAINNET ?? 'https://mainnet.sorobanrpc.com'
// empty by default so the mainnet spec skips. the source only has to be funded
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

// the testnet demo vaults belong to this account; TEST_WALLET has none, which the create path needs
export const DEMO_VAULT_OWNER = 'GCVFDROZF3D565FAURFQBXQEOHT4BPQK2P66JUCL5XQWNWQBOGXMRVQA'

// matches contracts.ts mainnet.tokens.usdcIssuer and mainnet.broker.endpoint
export const MAINNET_USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN'
export const BROKER_ENDPOINT = process.env.PLAYWRIGHT_BROKER_URL ?? 'https://api.stellar.broker'

// like shortenAddress in src/utils/format.ts (ascii dots), but 8 chars a side by default
export function shorten(addr: string, n = 8): string {
  return `${addr.slice(0, n)}...${addr.slice(-n)}`
}

// with no dfns profile picked the custody panels stay dark and sign buttons never mount
export async function seedDfnsDemo(page: Page) {
  await page.addInitScript(() => localStorage.setItem('lob_dfns_active', '__demo__'))
}

export async function seedWallet(page: Page) {
  await page.addInitScript(([addr, name]) => {
    localStorage.setItem('lob_addr', addr)
    localStorage.setItem('lob_wname', name)
  }, [TEST_WALLET.address, TEST_WALLET.name] as const)
}

export async function gotoWithWallet(page: Page, path: string = '/') {
  await seedWallet(page)
  await page.goto(path, { waitUntil: 'domcontentloaded' })
}
