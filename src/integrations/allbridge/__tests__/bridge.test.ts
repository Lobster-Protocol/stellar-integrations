import { describe, it, expect, vi, beforeEach } from 'vitest'

import { quoteBridge, buildBridgeTx, buildBridgeApproveTx, getBridgeSpender, resolveUsdc } from '../bridge'
import type { BridgeRequest } from '../types'

const TOKENS = {
  ETH: { symbol: 'USDC', chainSymbol: 'ETH', bridgeAddress: '0xBRIDGE-ETH', decimals: 6 },
  ARB: { symbol: 'USDC', chainSymbol: 'ARB', bridgeAddress: '0xBRIDGE-ARB', decimals: 6 },
  BSC: { symbol: 'USDC', chainSymbol: 'BSC', bridgeAddress: '0xBRIDGE-BSC', decimals: 6 },
  SRB: { symbol: 'USDC', chainSymbol: 'SRB', bridgeAddress: 'CBRIDGE-SRB', decimals: 7 },
}

type SendArgs = {
  amount: string
  fromAccountAddress: string
  toAccountAddress: string
  sourceToken: { chainSymbol: string }
  destinationToken: { chainSymbol: string }
}
type ApproveArgs = { token: { chainSymbol: string }; owner: string; amount: string }

function buildSdkMock() {
  return {
    tokensByChain: vi.fn(async (chain: string) => [TOKENS[chain as keyof typeof TOKENS]]),
    getAmountToBeReceived: vi.fn(async () => '49.85'),
    getGasFeeOptions: vi.fn(async () => ({
      native: { float: '0.0021' },
      stablecoin: { float: '0.5' },
    })),
    bridge: {
      rawTxBuilder: {
        send: vi.fn(async (p: SendArgs) => ({ from: p.fromAccountAddress, to: '0xBRIDGE-ARB', data: '0xDEADBEEF', value: '0' })),
        approve: vi.fn(async (p: ApproveArgs) => ({ from: p.owner, to: '0xUSDC-ARB', data: '0xAPPROVE', value: '0' })),
      },
    },
  }
}

const VALID_REQ: BridgeRequest = {
  sourceChain: 'ARB',
  amount: '50',
  fromAddress: '0x1234567890abcdef1234567890abcdef12345678',
  toAddress: 'GA2PK7ZWHBJOFSGLZDAE65I7GQ5PFONWKUG5SGNJZ24HGYBLVCV64MBU',
}

let sdk: ReturnType<typeof buildSdkMock>

beforeEach(() => {
  sdk = buildSdkMock()
})

describe('resolveUsdc', () => {
  it('finds the USDC token on the requested chain', async () => {
    const token = await resolveUsdc(sdk as never, 'ARB' as never)
    expect(token.symbol).toBe('USDC')
    expect(sdk.tokensByChain).toHaveBeenCalledWith('ARB')
  })

  it('throws when no USDC token exists on the chain', async () => {
    sdk.tokensByChain.mockResolvedValueOnce([])
    await expect(resolveUsdc(sdk as never, 'ARB' as never)).rejects.toThrow(/USDC not available/i)
  })
})

describe('quoteBridge', () => {
  it('returns the amounts plus the 2 minute eta estimate', async () => {
    const q = await quoteBridge(sdk as never, VALID_REQ, false)
    expect(q.amountInFloat).toBe('50')
    expect(q.amountOutFloat).toBe('49.85')
    expect(q.estimatedTimeSeconds).toBe(120)
    expect(q.trustlineRequired).toBe(false)
  })

  it('flattens gas fee objects to their float string', async () => {
    const q = await quoteBridge(sdk as never, VALID_REQ, false)
    expect(q.gasFeeOptions.native).toBe('0.0021')
    expect(q.gasFeeOptions.stablecoin).toBe('0.5')
  })

  it('skips gas fee entries with an unexpected shape', async () => {
    sdk.getGasFeeOptions.mockResolvedValueOnce({
      native: { float: '0.0021' },
      bogus: { weird: true },
    } as never)
    const q = await quoteBridge(sdk as never, VALID_REQ, false)
    expect(q.gasFeeOptions.native).toBe('0.0021')
    expect(q.gasFeeOptions.bogus).toBeUndefined()
  })

  it('rejects a request with a bad stellar account id', async () => {
    await expect(
      quoteBridge(sdk as never, { ...VALID_REQ, toAddress: 'not-a-valid-G-address' }, false),
    ).rejects.toThrow()
  })

  it('rejects a request with a bad EVM source address', async () => {
    await expect(
      quoteBridge(sdk as never, { ...VALID_REQ, fromAddress: '0xshort' }, false),
    ).rejects.toThrow()
  })

  it('rejects a non-positive amount', async () => {
    await expect(
      quoteBridge(sdk as never, { ...VALID_REQ, amount: '0' }, false),
    ).rejects.toThrow()
  })

  it('queries USDC on the source EVM chain and on SRB once each', async () => {
    await quoteBridge(sdk as never, VALID_REQ, false)
    const chains = sdk.tokensByChain.mock.calls.map((c) => c[0])
    expect(chains).toEqual(['ARB', 'SRB'])
  })
})

describe('buildBridgeTx', () => {
  it('uses Messenger.ALLBRIDGE and the resolved tokens', async () => {
    await buildBridgeTx(sdk as never, VALID_REQ)
    const args = sdk.bridge.rawTxBuilder.send.mock.calls[0][0]
    expect(args.amount).toBe('50')
    expect(args.fromAccountAddress).toBe(VALID_REQ.fromAddress)
    expect(args.toAccountAddress).toBe(VALID_REQ.toAddress)
    expect(args.sourceToken.chainSymbol).toBe('ARB')
    expect(args.destinationToken.chainSymbol).toBe('SRB')
  })

  it('rejects a malformed request before any SDK call', async () => {
    await expect(
      buildBridgeTx(sdk as never, { ...VALID_REQ, toAddress: 'GA-BAD' }),
    ).rejects.toThrow()
    expect(sdk.bridge.rawTxBuilder.send).not.toHaveBeenCalled()
  })
})

describe('buildBridgeApproveTx', () => {
  it('builds an approve op against the source-chain USDC', async () => {
    await buildBridgeApproveTx(sdk as never, VALID_REQ.fromAddress, 'ARB', '50')
    const args = sdk.bridge.rawTxBuilder.approve.mock.calls[0][0]
    expect(args.token.chainSymbol).toBe('ARB')
    expect(args.owner).toBe(VALID_REQ.fromAddress)
    expect(args.amount).toBe('50')
  })
})

describe('getBridgeSpender', () => {
  it('returns the bridgeAddress field of the resolved source-chain USDC', async () => {
    const spender = await getBridgeSpender(sdk as never, 'ARB')
    expect(spender).toBe('0xBRIDGE-ARB')
  })
})
