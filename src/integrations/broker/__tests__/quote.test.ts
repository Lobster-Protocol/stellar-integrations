import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estimateSwap, StellarBrokerError } = vi.hoisted(() => {
  const fn = vi.fn()
  // mirrors the real sdk error: a numeric `code`, and `name` left as 'Error'
  // (the sdk never sets it), so detection has to key off the code.
  class Err extends Error {
    readonly code: number
    constructor(code: number, message: string) {
      super(message)
      this.code = code
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
    const quote = await quoteBroker(VALID_PARAMS)
    expect(quote?.status).toBe('success')
    expect(quote?.estimatedBuyingAmount).toBe('23.45')
  })

  it('returns null when the server signals no quote (codes 11/12/13)', async () => {
    for (const code of [11, 12, 13]) {
      estimateSwap.mockRejectedValueOnce(new StellarBrokerError(code, 'no quote'))
      expect(await quoteBroker(VALID_PARAMS)).toBeNull()
    }
  })

  it('propagates broker errors outside the no-quote family', async () => {
    estimateSwap.mockRejectedValueOnce(new StellarBrokerError(14, 'Invalid quote request parameter'))
    await expect(quoteBroker(VALID_PARAMS)).rejects.toThrow(/Invalid quote request parameter/)
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
