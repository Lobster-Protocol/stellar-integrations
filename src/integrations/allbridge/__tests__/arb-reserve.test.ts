import { describe, it, expect, vi, beforeEach } from 'vitest'

// We don't have a real Allbridge SDK instance in unit tests; this stub is
// enough for arb-reserve's pure functions (no network IO, just delegates
// to quoteBridge / buildBridgeTx with the right shape).
const tokensByChain = vi.fn(async () => [{ symbol: 'USDC', decimals: 6 }])
const getAmountToBeReceived = vi.fn(async () => '49.85')
const getGasFeeOptions = vi.fn(async () => ({ native: { float: '0.0001' } }))
const rawTxBuilderSend = vi.fn(async () => ({ kind: 'raw', source: 'ARB' }))

const fakeSdk = {
  tokensByChain,
  getAmountToBeReceived,
  getGasFeeOptions,
  bridge: { rawTxBuilder: { send: rawTxBuilderSend } },
}

const { ArbDispatchSchema, buildOutboundLegTx, quoteReturnLeg, buildReturnLegTx } = await import('../arb-reserve')

const validDispatch = {
  stellarReserveAccount: 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU',
  evmExecutionAccount: '0x1234567890abcdef1234567890abcdef12345678',
  amount: '50000',
  targetChain: 'ARB' as const,
  rationale: 'AQUA/USDC pool on Aquarius vs USDC/WETH on Camelot - 0.18% delta after fees.',
}

describe('ArbDispatchSchema', () => {
  it('accepts a well-formed dispatch', () => {
    expect(() => ArbDispatchSchema.parse(validDispatch)).not.toThrow()
  })

  it('rejects a rationale that is too long', () => {
    expect(() => ArbDispatchSchema.parse({ ...validDispatch, rationale: 'a'.repeat(281) })).toThrow()
  })

  it('rejects an empty rationale', () => {
    expect(() => ArbDispatchSchema.parse({ ...validDispatch, rationale: '' })).toThrow()
  })

  it('rejects an unsupported targetChain', () => {
    expect(() => ArbDispatchSchema.parse({ ...validDispatch, targetChain: 'SOL' })).toThrow()
  })

  it('rejects amount = "0" (shared positiveAmountRegex)', () => {
    expect(() => ArbDispatchSchema.parse({ ...validDispatch, amount: '0' })).toThrow()
  })

  it('rejects amount with leading zero ("007.5")', () => {
    expect(() => ArbDispatchSchema.parse({ ...validDispatch, amount: '007.5' })).toThrow()
  })

  it('rejects amount with >6 decimals (USDC precision)', () => {
    expect(() => ArbDispatchSchema.parse({ ...validDispatch, amount: '1.1234567' })).toThrow()
  })
})

describe('buildOutboundLegTx', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('throws because the outbound leg is gated behind a feature flag', async () => {
    await expect(buildOutboundLegTx()).rejects.toThrow(/not ready yet/)
  })
})

describe('quoteReturnLeg', () => {
  beforeEach(() => {
    tokensByChain.mockClear()
    getAmountToBeReceived.mockClear()
    getGasFeeOptions.mockClear()
  })

  it('produces a BridgeQuote using the dispatch fields', async () => {
    const quote = await quoteReturnLeg(fakeSdk as never, validDispatch, false)
    expect(quote.amountInFloat).toBe(validDispatch.amount)
    expect(quote.amountOutFloat).toBe('49.85')
    expect(quote.trustlineRequired).toBe(false)
    // tokensByChain should be called once for source (ARB) and once for SRB
    expect(tokensByChain).toHaveBeenCalledTimes(2)
  })

  it('rejects an invalid dispatch via the Zod schema before any SDK call', async () => {
    await expect(
      quoteReturnLeg(fakeSdk as never, { ...validDispatch, amount: '0' }, false),
    ).rejects.toBeTruthy()
    expect(tokensByChain).not.toHaveBeenCalled()
  })
})

describe('buildReturnLegTx', () => {
  beforeEach(() => {
    rawTxBuilderSend.mockClear()
  })

  it('passes a BridgeRequest with the dispatch payload to rawTxBuilder.send', async () => {
    const raw = await buildReturnLegTx(fakeSdk as never, validDispatch)
    expect(rawTxBuilderSend).toHaveBeenCalledTimes(1)
    const call = rawTxBuilderSend.mock.calls[0] as unknown as [
      { amount: string; fromAccountAddress: string; toAccountAddress: string },
    ]
    const args = call[0]
    expect(args.amount).toBe(validDispatch.amount)
    expect(args.fromAccountAddress).toBe(validDispatch.evmExecutionAccount)
    expect(args.toAccountAddress).toBe(validDispatch.stellarReserveAccount)
    expect(raw).toEqual({ kind: 'raw', source: 'ARB' })
  })
})
