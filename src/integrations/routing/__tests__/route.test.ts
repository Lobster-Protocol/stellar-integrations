import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest'

vi.mock('../../broker/quote', () => ({ quoteBroker: vi.fn() }))
vi.mock('../../broker/soroswap-fallback', async () => {
  const actual = await vi.importActual<typeof import('../../broker/soroswap-fallback')>(
    '../../broker/soroswap-fallback',
  )
  return { ...actual, quoteSoroswapDirect: vi.fn() }
})

const partnerKeyBefore = import.meta.env.VITE_STELLAR_BROKER_PARTNER_KEY

import { routeSwap } from '../route'
import { quoteBroker } from '../../broker/quote'
import { quoteSoroswapDirect } from '../../broker/soroswap-fallback'

const quoteBrokerMock = quoteBroker as unknown as ReturnType<typeof vi.fn>
const quoteSoroswapMock = quoteSoroswapDirect as unknown as ReturnType<typeof vi.fn>

const VALID_PARAMS = {
  sellingAsset: 'xlm',
  buyingAsset: 'USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  sellingAmount: '100',
  slippageTolerance: 0.02,
}

const CTX = {
  network: 'mainnet' as const,
  callerAccount: 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU',
}

beforeEach(() => {
  quoteBrokerMock.mockReset()
  quoteSoroswapMock.mockReset()
  Reflect.set(import.meta.env, 'VITE_STELLAR_BROKER_PARTNER_KEY', 'test-partner-key')
})

describe('routeSwap', () => {
  it('returns broker source when broker quote validates', async () => {
    quoteBrokerMock.mockResolvedValueOnce({
      ts: new Date(),
      status: 'success',
      sellingAsset: VALID_PARAMS.sellingAsset,
      buyingAsset: VALID_PARAMS.buyingAsset,
      slippageTolerance: 0.02,
      sellingAmount: '100',
      estimatedBuyingAmount: '23.45',
      profit: '0.05',
    })
    const r = await routeSwap(VALID_PARAMS, CTX)
    expect(r.source).toBe('broker')
    expect(r.broker?.status).toBe('success')
  })

  it('falls through to soroswap when broker returns no quote', async () => {
    quoteBrokerMock.mockResolvedValueOnce(null)
    quoteSoroswapMock.mockResolvedValueOnce(234_500_000n)
    const r = await routeSwap(VALID_PARAMS, CTX)
    expect(r.source).toBe('soroswap-fallback')
    expect(r.soroswap?.buyingStroops).toBe(234_500_000n)
  })

  it('falls through to soroswap when broker quote fails validation', async () => {
    quoteBrokerMock.mockResolvedValueOnce({
      ts: new Date(),
      status: 'success',
      sellingAsset: VALID_PARAMS.sellingAsset,
      buyingAsset: VALID_PARAMS.buyingAsset,
      slippageTolerance: 0.1,
      sellingAmount: '100',
      estimatedBuyingAmount: '23.45',
      profit: '0',
    })
    quoteSoroswapMock.mockResolvedValueOnce(234_500_000n)
    const r = await routeSwap(VALID_PARAMS, CTX)
    expect(r.source).toBe('soroswap-fallback')
  })

  it('falls through to soroswap when the broker quote throws (it must not sink the route)', async () => {
    quoteBrokerMock.mockRejectedValueOnce(new Error('broker rejected: pair not supported'))
    quoteSoroswapMock.mockResolvedValueOnce(234_500_000n)
    const r = await routeSwap(VALID_PARAMS, CTX)
    expect(r.source).toBe('soroswap-fallback')
    expect(r.broker).toBeUndefined()
  })

  it('reports none with a reason when the broker throws and there is no fallback router', async () => {
    quoteBrokerMock.mockRejectedValueOnce(new Error('broker rejected: pair not supported'))
    const r = await routeSwap(VALID_PARAMS, { ...CTX, network: 'testnet' })
    expect(r.source).toBe('none')
    expect(r.reason).toBeTruthy()
  })

  it('reports none when neither broker nor soroswap have a path', async () => {
    quoteBrokerMock.mockResolvedValueOnce(null)
    quoteSoroswapMock.mockResolvedValueOnce(null)
    const r = await routeSwap(VALID_PARAMS, CTX)
    expect(r.source).toBe('none')
  })

  it('keeps a keyless broker reference quote but settles on soroswap when the partner key is missing', async () => {
    Reflect.set(import.meta.env, 'VITE_STELLAR_BROKER_PARTNER_KEY', '')
    quoteBrokerMock.mockResolvedValueOnce({
      ts: new Date(),
      status: 'success',
      sellingAsset: VALID_PARAMS.sellingAsset,
      buyingAsset: VALID_PARAMS.buyingAsset,
      slippageTolerance: 0.02,
      sellingAmount: '100',
      estimatedBuyingAmount: '23.45',
      profit: '0.05',
    })
    quoteSoroswapMock.mockResolvedValueOnce(234_500_000n)
    const r = await routeSwap(VALID_PARAMS, CTX)
    expect(quoteBrokerMock).toHaveBeenCalled()
    expect(r.source).toBe('soroswap-fallback')
    // the broker quote rides along as a best-execution reference
    expect(r.broker?.status).toBe('success')
  })

  it('reports none when amount is invalid', async () => {
    quoteBrokerMock.mockResolvedValueOnce(null)
    const r = await routeSwap({ ...VALID_PARAMS, sellingAmount: '0' }, CTX)
    expect(r.source).toBe('none')
  })
})

afterAll(() => {
  Reflect.set(import.meta.env, 'VITE_STELLAR_BROKER_PARTNER_KEY', partnerKeyBefore)
})
