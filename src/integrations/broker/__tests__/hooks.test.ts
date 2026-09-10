import { describe, it, expect, vi, beforeEach } from 'vitest'

import type { BrokerQuoteParams } from '../types'
import type { Signer } from '../../signer/types'

// capture what buildSoroswapConfirmTx hands the envelope builder, so we can assert
// the minAmountOut it freezes. buildSoroswapSwapTx itself talks to the chain, so it
// is mocked; asset-mapping is mocked so the confirm path resolves without a network.
const { buildSpy } = vi.hoisted(() => ({ buildSpy: vi.fn(async () => 'PREPARED_XDR') }))
vi.mock('../soroswap-fallback', () => ({ buildSoroswapSwapTx: buildSpy }))
vi.mock('../asset-mapping', () => ({
  brokerAssetToSac: (asset: string) => (asset === 'xlm' ? 'CXLM' : 'CUSDC'),
  toStroops: (s: string) => BigInt(Math.round(Number(s) * 10_000_000)),
}))

import { buildSoroswapConfirmTx, SOROSWAP_SLIPPAGE } from '../hooks'

beforeEach(() => buildSpy.mockClear())

const args = (buyingStroops: bigint) => ({
  account: 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU',
  network: 'testnet' as const,
  networkPassphrase: 'Test SDF Network ; September 2015',
  params: {
    sellingAsset: 'xlm',
    buyingAsset: 'USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    sellingAmount: '100',
    slippageTolerance: 0.02,
  } as BrokerQuoteParams,
  buyingStroops,
  signer: {} as Signer,
})

describe('SOROSWAP_SLIPPAGE', () => {
  it('is 1% - the single figure the swap panel shows and the leg enforces', () => {
    // the panel renders SOROSWAP_SLIPPAGE * 100 and the confirm path derives
    // minAmountOut from the same constant, so display and enforcement can't drift
    // (the old bug: "2%" shown, 1% enforced).
    expect(SOROSWAP_SLIPPAGE).toBe(0.01)
    expect(SOROSWAP_SLIPPAGE * 100).toBe(1)
  })
})

describe('buildSoroswapConfirmTx minAmountOut', () => {
  it('freezes minAmountOut at a 1% haircut off the quoted buying amount', async () => {
    const buying = 1_000_000_000n
    await buildSoroswapConfirmTx(args(buying))
    const passed = buildSpy.mock.calls[0][0] as { minAmountOut: bigint }
    // 1% off 100.0000000 XLM = 99.0000000
    expect(passed.minAmountOut).toBe(990_000_000n)
    expect(passed.minAmountOut).toBe((buying * 9900n) / 10000n)
  })

  it('never asks for more than the quote, whatever the amount', async () => {
    const buying = 987_654_321n
    await buildSoroswapConfirmTx(args(buying))
    const passed = buildSpy.mock.calls[0][0] as { minAmountOut: bigint }
    expect(passed.minAmountOut).toBeLessThan(buying)
    // exactly the constant-derived floor, so the number shown stays the number enforced
    expect(passed.minAmountOut).toBe(
      (buying * BigInt(Math.floor((1 - SOROSWAP_SLIPPAGE) * 10_000))) / 10_000n,
    )
  })
})
