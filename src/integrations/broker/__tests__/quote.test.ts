import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estimateSwap, StellarBrokerError } = vi.hoisted(() => {
  const fn = vi.fn()
  class Err extends Error {
    readonly code: number
    constructor(code: number, message: string) {
      super(message)
      this.code = code
      this.name = 'StellarBrokerError'
    }
  }
  return { estimateSwap: fn, StellarBrokerError: Err }
})

vi.mock('@stellar-broker/client', () => ({
  estimateSwap,
  StellarBrokerError,
}))

import { quoteBroker } from '../quote'

const VALID_PARAMS = {
  sellingAsset: 'xlm',
  buyingAsset: 'USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  sellingAmount: '100',
  slippageTolerance: 0.02,
}

const SUCCESS_RAW = {
  ts: new Date(),
  status: 'success',
  sellingAsset: VALID_PARAMS.sellingAsset,
  buyingAsset: VALID_PARAMS.buyingAsset,
  slippageTolerance: 0.02,
  sellingAmount: '100',
  estimatedBuyingAmount: '23.45',
  profit: '0.42',
}

beforeEach(() => {
  estimateSwap.mockReset()
})

describe('quoteBroker', () => {
  it('returns a parsed quote on success', async () => {
    estimateSwap.mockResolvedValueOnce(SUCCESS_RAW)
    const result = await quoteBroker(VALID_PARAMS)
    expect(result?.status).toBe('success')
    expect(result?.estimatedBuyingAmount).toBe('23.45')
  })

  it('returns null when the server signals code 11 (no liquidity)', async () => {
    estimateSwap.mockRejectedValueOnce(new StellarBrokerError(11, 'Price quote not available'))
    const result = await quoteBroker(VALID_PARAMS)
    expect(result).toBeNull()
  })

  it('propagates other broker error codes', async () => {
    estimateSwap.mockRejectedValueOnce(new StellarBrokerError(13, 'Quote request failed'))
    await expect(quoteBroker(VALID_PARAMS)).rejects.toThrow(/Quote request failed/)
  })

  it('propagates non-broker errors as-is', async () => {
    estimateSwap.mockRejectedValueOnce(new Error('network down'))
    await expect(quoteBroker(VALID_PARAMS)).rejects.toThrow('network down')
  })

  it('rejects malformed params before reaching the sdk', async () => {
    await expect(
      quoteBroker({ sellingAsset: '', buyingAsset: 'USDC-G...' } as never),
    ).rejects.toThrow()
    expect(estimateSwap).not.toHaveBeenCalled()
  })
})
